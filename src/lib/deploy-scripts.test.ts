import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// The server's scripts in deploy/ (M2, D50), run by bash against stand-ins for curl, docker, restic
// and journalctl (tests/fixtures/deploy/bin) or sourced for their functions, as
// src/lib/restore-carry.test.ts does for the carry-over. None of them runs anything for real: the
// server, Docker and listmonk itself are checked in CI (.github/workflows/ci.yml) and on the server
// (deploy/README.md).

const ROOT = process.cwd()
const DEPLOY = join(ROOT, 'deploy')
const FAKE_BIN = join(ROOT, 'tests/fixtures/deploy/bin')

let folders: string[] = []

afterEach(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  folders = []
})

function folder() {
  const path = mkdtempSync(join(tmpdir(), 'deploy-scripts-'))
  folders.push(path)
  return path
}

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** Every file under a folder, as paths relative to the repository. */
function filesUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)))
    .sort()
}

/** Runs a script with only the given environment (and the stand-ins first on PATH). */
function runScript(script: string, args: string[], env: Record<string, string>, input = '') {
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    input,
    env: { NODE_ENV: 'test', PATH: `${FAKE_BIN}:${process.env.PATH}`, LANG: 'C.UTF-8', ...env },
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** Sources a script (its functions only) and runs `call` in bash; returns what it printed. */
function sourced(script: string, call: string, env: Record<string, string> = {}, input = '') {
  return execFileSync('bash', ['-c', `source "$SCRIPT"\n${call}`, 'sourced'], {
    encoding: 'utf8',
    input,
    // What a function says on stderr (a warning) is not part of its answer.
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      NODE_ENV: 'test',
      PATH: process.env.PATH,
      LANG: 'C.UTF-8',
      SCRIPT: join(ROOT, script),
      ...env,
    },
  })
}

describe('the deploy scripts', () => {
  const scripts = filesUnder('deploy').filter((file) => file.endsWith('.sh'))

  it.each(scripts)('%s is valid bash and executable', (file) => {
    // A syntax error would show only on the server, when the script runs.
    expect(() => execFileSync('bash', ['-n', join(ROOT, file)])).not.toThrow()
    expect(statSync(join(ROOT, file)).mode & 0o111, `chmod +x ${file}`).toBe(0o111)
  })

  it('include every script a systemd unit runs', () => {
    // The units run the copies in /opt/gliagora, which are this folder's files.
    const units = filesUnder('deploy').filter((file) => /\.(service|timer)$/.test(file))
    const commands = units.flatMap((unit) =>
      [...read(unit).matchAll(/^Exec\w*=[-+!@:]*(\S+)/gm)].map((match) => match[1] as string),
    )
    expect(commands).toContain('/opt/gliagora/backup/alert.sh')
    for (const command of commands) {
      expect(command, 'a unit runs a script of /opt/gliagora').toMatch(/^\/opt\/gliagora\//)
      const file = join(DEPLOY, command.replace('/opt/gliagora/', ''))
      expect(statSync(file).mode & 0o111, `${command} exists and is executable`).toBe(0o111)
    }
  })

  it('read .env the same way where two of them do', () => {
    // backup/alert.sh and listmonk/prepare.sh each parse it (never source it); one function.
    const fn = (file: string) => /^env_value\(\) \{\n[\s\S]*?\n\}$/m.exec(read(file))?.[0]
    expect(fn('deploy/backup/alert.sh')).toBeDefined()
    expect(fn('deploy/backup/alert.sh')).toBe(fn('deploy/listmonk/prepare.sh'))
  })
})

describe('the production stack (deploy/compose.prod.yml)', () => {
  const compose = read('deploy/compose.prod.yml')
  const local = read('compose.yaml')
  /** A service's block: from its name to the next line at that indentation. */
  const service = (text: string, name: string) =>
    new RegExp(`\\n  ${name}:\\n((?:    .*\\n|\\s*\\n)+)`).exec(text)?.[1] ?? ''

  it('runs the same listmonk as local development and the tests, pinned by digest', () => {
    const image = (text: string) => /image:\s*(listmonk\/listmonk\S+)/.exec(text)?.[1]
    expect(image(compose)).toMatch(/^listmonk\/listmonk:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/)
    expect(image(local)).toBe(image(compose))
  })

  it('is what CI tests with: the same PostgreSQL image', () => {
    const image = /image:\s*(postgres:\S+)/.exec(compose)?.[1]
    expect(image).toMatch(/^postgres:[\d.]+@sha256:[0-9a-f]{64}$/)
    expect(/^\s*POSTGRES_IMAGE: (\S+)$/m.exec(read('.github/workflows/ci.yml'))?.[1]).toBe(image)
  })

  it('publishes listmonk on the server’s loopback only, and nothing depends on it', () => {
    for (const text of [compose, local]) {
      const ports =
        /\n {4}ports:\n((?: {6}(?:- |# ).*\n)+)/.exec(service(text, 'listmonk'))?.[1] ?? ''
      const published = [...ports.matchAll(/- '([^']+)'/g)].map((match) => match[1])
      expect(published.length).toBeGreaterThan(0)
      for (const port of published) expect(port).toMatch(/^127\.0\.0\.1:/)
    }
    // The app and its deploys keep working while listmonk is down.
    for (const name of ['caddy', 'app', 'db']) {
      expect(service(compose, name)).not.toMatch(/depends_on:[\s\S]*listmonk/)
    }
  })

  it('never lets listmonk make its own admin account, and keeps it unprivileged', () => {
    const listmonk = service(compose, 'listmonk')
    // listmonk/prepare.sh installs it, with the password on stdin.
    expect(listmonk).not.toContain('--install')
    expect(listmonk).not.toContain('LISTMONK_ADMIN')
    expect(listmonk).toContain('no-new-privileges:true')
    expect(listmonk).toMatch(/cap_drop:\n\s+- ALL/)
    expect(listmonk).toContain('LISTMONK_db__password: ${LISTMONK_DB_PASSWORD:?')
    // The database's init script reads the same password.
    expect(service(compose, 'db')).toContain(
      'LISTMONK_DB_PASSWORD: ${LISTMONK_DB_PASSWORD:?Set LISTMONK_DB_PASSWORD in .env}',
    )
    // Locally too, listmonk connects as its own role, made by the server's script, never as the
    // superuser (which its SQL expressions could otherwise use).
    expect(service(local, 'listmonk')).toContain('LISTMONK_db__user: listmonk\n')
    expect(service(local, 'listmonk-database')).toContain(
      './deploy/postgres/init/20-listmonk-database.sh:/20-listmonk-database.sh:ro',
    )
    expect(service(local, 'listmonk-database')).toContain(
      'command: [bash, /20-listmonk-database.sh]',
    )
  })

  it('gives the app’s API user in listmonk no SQL expressions', () => {
    // settings.sql, step 3; tests/integration/listmonk.db.test.ts checks the refusal for real.
    const role = /values \('user', 'gliagora-app', '(\{[^}]*\})'\)/.exec(
      read('deploy/listmonk/settings.sql'),
    )?.[1]
    expect(role).toBe('{subscribers:get,subscribers:manage}')
  })

  it('logs every service to the journal, which keeps 14 days (D34)', () => {
    const block = compose.slice(compose.indexOf('\nservices:\n'), compose.indexOf('\nnetworks:\n'))
    const services = [...block.matchAll(/^ {2}(\w[\w-]*):$/gm)].map((match) => match[1]!)
    expect(services).toEqual(['caddy', 'app', 'db', 'listmonk'])
    for (const name of services) expect(service(compose, name)).toContain('logging: *logging')
    expect(compose).toMatch(/x-logging: &logging\n {2}driver: journald\n/)
    const journald = read('deploy/logs/90-gliagora.conf')
    expect(journald).toMatch(/^MaxRetentionSec=14day$/m)
    expect(journald).toMatch(/^ForwardToSyslog=no$/m)
    // New servers get it from setup-server.sh.
    expect(read('deploy/setup-server.sh')).toContain('bash "$SCRIPT_DIR/logs/install-journald.sh"')
    expect(read('deploy/logs/install-journald.sh')).toContain('90-gliagora.conf')
  })

  it('passes the email cap to the app, empty by default', () => {
    for (const name of ['EMAIL_CAP_HOUR', 'EMAIL_CAP_DAY']) {
      expect(service(compose, 'app')).toContain(`${name}: \${${name}:-}`)
      expect(read('deploy/.env.example')).toMatch(new RegExp(`^${name}=$`, 'm'))
      expect(read('.env.example')).toMatch(new RegExp(`^# ${name}=$`, 'm'))
    }
  })

  it('has every secret the stack needs generated by the runbook’s step 2', () => {
    const example = read('deploy/.env.example')
    const secrets = [...example.matchAll(/^(\w+)=replace-with-openssl-rand-hex-32$/gm)].map(
      (match) => match[1],
    )
    expect(secrets).toEqual(expect.arrayContaining(['LISTMONK_DB_PASSWORD', 'LISTMONK_API_TOKEN']))
    const loop = /case "\$line" in\n\s+(.+)\)\n/.exec(read('deploy/README.md'))?.[1]
    expect(
      loop
        ?.split(' | ')
        .map((pattern) => pattern.replace(/=\*$/, ''))
        .sort(),
    ).toEqual(secrets.sort())
  })
})

describe('backup/backup.sh', () => {
  const SCRIPT = join(DEPLOY, 'backup/backup.sh')

  it('backs up the app’s and listmonk’s databases, and emails no one until set', () => {
    const example = read('deploy/backup/backup.env.example')
    expect(example).toMatch(/^DATABASES="gliagora listmonk"$/m)
    // Never a real address in the repository.
    expect(example).toMatch(/^ALERT_EMAIL=$/m)
  })

  it('leaves out the rows that never go into backups, for each database', () => {
    const excluded = (db: string) => sourced('deploy/backup/backup.sh', `excluded_data ${db}`)
    expect(excluded('gliagora').trim().split('\n')).toEqual([
      '--exclude-table-data=public.form_limits',
      '--exclude-table-data=public.member_sessions',
      '--exclude-table-data=public.email_tokens',
    ])
    expect(excluded('listmonk').trim()).toBe('--exclude-table-data=public.sessions')
    expect(excluded('umami')).toBe('')
  })

  function backup(databases: string, onServer: string) {
    const dir = folder()
    writeFileSync(join(dir, '.env'), 'SITE_DOMAIN=example.org\n')
    writeFileSync(
      join(dir, 'backup.env'),
      `COMPOSE_DIR=${dir}\nRESTIC_REPOSITORY=${dir}/missing-repository\nRESTIC_PASSWORD_FILE=${dir}/pw\nDATABASES="${databases}"\n`,
    )
    const result = runScript(SCRIPT, ['pre-update'], {
      BACKUP_CONFIG: join(dir, 'backup.env'),
      FAKE_LOG: dir,
      FAKE_DATABASES: onServer,
    })
    const log = (name: string) => {
      try {
        return readFileSync(join(dir, name), 'utf8')
      } catch {
        return ''
      }
    }
    return { ...result, docker: log('docker.log'), restic: log('restic.log'), dir }
  }

  it('dumps each listed database with its own exclusions, and the settings with listmonk’s', () => {
    const { status, output, docker, restic, dir } = backup('gliagora listmonk', 'gliagora listmonk')
    expect(status, output).toBe(0)
    expect(docker).toMatch(/pg_dump .*--exclude-table-data=public\.email_tokens gliagora\n/)
    expect(docker).toMatch(
      /pg_dump -U postgres --format=custom --compress=0 --exclude-table-data=public\.sessions listmonk\n/,
    )
    expect(restic).toContain('--stdin-filename listmonk.dump')
    expect(restic).toContain('--tag db:listmonk')
    // The settings: named one by one; listmonk's folder only if it exists on the server.
    expect(restic).toMatch(new RegExp(`--tag config --quiet ${dir}/\\.env ${dir}/backup\\.env\\n`))
  })

  it('skips a listed database the server does not have yet (listmonk before its install)', () => {
    const { status, output, docker } = backup('gliagora listmonk', 'gliagora')
    expect(status, output).toBe(0)
    expect(output).toContain(
      'Database listmonk is in DATABASES but not on the server (yet): skipped',
    )
    expect(docker).not.toMatch(/pg_dump .* listmonk\n/)
  })

  it('fails, after storing the others, when the server has a database DATABASES does not name', () => {
    const { status, output, docker } = backup('gliagora', 'gliagora listmonk umami')
    expect(status).toBe(1)
    expect(docker).toMatch(/pg_dump .* gliagora\n/)
    expect(output).toContain('does not name, so they were not backed up: listmonk umami')
  })
})

describe('backup/restore.sh', () => {
  const SCRIPT = join(DEPLOY, 'backup/restore.sh')

  function restore(args: string[], snapshots: string) {
    const dir = folder()
    writeFileSync(join(dir, 'compose.prod.yml'), 'name: gliagora\n')
    writeFileSync(
      join(dir, 'backup.env'),
      `COMPOSE_DIR=${dir}\nRESTIC_REPOSITORY=${dir}/repository\nRESTIC_PASSWORD_FILE=${dir}/pw\nDATABASES="gliagora listmonk"\n`,
    )
    const result = runScript(SCRIPT, args, {
      BACKUP_CONFIG: join(dir, 'backup.env'),
      FAKE_LOG: dir,
      FAKE_SNAPSHOTS: snapshots,
    })
    let docker = ''
    try {
      docker = readFileSync(join(dir, 'docker.log'), 'utf8')
    } catch {
      // Not called.
    }
    return { ...result, docker }
  }

  it('without a database, tests every database of DATABASES, each in its own container', () => {
    const { status, output, docker } = restore(['test', 'latest'], 'gliagora listmonk')
    expect(status, output).toBe(0)
    expect(output).toContain('Restore test passed: gliagora, 12 tables, 40 migrations.')
    expect(output).toContain('Restore test passed: listmonk, 12 tables, 1 migrations.')
    expect(output).toContain('Restore tests passed: gliagora listmonk.')
    // Two containers, each removed with its data.
    const started = docker.match(/^docker run -d --name (\S+) --network none /gm) ?? []
    const removed = docker.match(/^docker rm -f -v (\S+)$/gm) ?? []
    expect(started).toHaveLength(2)
    expect(removed).toHaveLength(2)
    // listmonk's check reads its own migration record; only the app's database carries rows.
    expect(docker).toContain("select count(*) from settings where key = 'migrations'")
    expect(docker.match(/to_regclass/g)).toHaveLength(2)
  })

  it('tests the others when one fails, and fails naming it', () => {
    const { status, output } = restore(['test'], 'gliagora')
    expect(status).toBe(1)
    expect(output).toContain('Restore test passed: gliagora')
    expect(output).toContain('No snapshot with tag db:listmonk.')
    expect(output).toContain('The restore test failed for: listmonk (see above).')
  })

  it('tests one database when it is named, or the one a snapshot ID holds', () => {
    const named = restore(['test', 'latest', 'listmonk'], 'gliagora listmonk')
    expect(named.status, named.output).toBe(0)
    expect(named.output).toContain('Restore test passed: listmonk')
    expect(named.output).not.toContain('gliagora,')
    // The stand-in's snapshot of listmonk (tests/fixtures/deploy/bin/restic).
    const byId = restore(['test', 'b'.repeat(64)], 'gliagora listmonk')
    expect(byId.status, byId.output).toBe(0)
    expect(byId.output).toContain('Restore test passed: listmonk')
  })

  it('shows its usage, the whole comment at its top', () => {
    const { status, output } = restore(['help'], '')
    expect(status).toBe(1)
    expect(output).toMatch(/^Restore from the encrypted restic backups/)
    expect(output).toContain('sudo ./restore.sh carry DIR [DB]')
    expect(output.trim()).toMatch(/from the same night \(deploy\/README\.md, step 7\)\.$/)
    expect(output).not.toContain('set -euo')
  })

  it('knows which service uses each database', () => {
    expect(sourced('deploy/backup/restore.sh', 'service_of gliagora; service_of listmonk')).toBe(
      'app\nlistmonk\n',
    )
    expect(() => sourced('deploy/backup/restore.sh', 'service_of umami')).toThrow()
  })
})

describe('update.sh', () => {
  /** Runs update.sh in a folder of its own, with stand-ins for backup.sh and prepare.sh. */
  function update(env: Record<string, string>) {
    const dir = folder()
    writeFileSync(join(dir, 'update.sh'), read('deploy/update.sh'))
    writeFileSync(join(dir, 'compose.prod.yml'), 'name: gliagora\n')
    for (const script of ['backup/backup.sh', 'listmonk/prepare.sh']) {
      execFileSync('mkdir', ['-p', join(dir, script, '..')])
      writeFileSync(
        join(dir, script),
        `#!/usr/bin/env bash\necho "ran ${script} $*" >>"$FAKE_LOG/docker.log"\n`,
      )
      chmodSync(join(dir, script), 0o755)
    }
    const result = runScript(join(dir, 'update.sh'), ['--no-pull'], { FAKE_LOG: dir, ...env })
    const calls = readFileSync(join(dir, 'docker.log'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.replace(/--project-directory \S+ -f \S+ /, ''))
    return { ...result, calls }
  }

  it('starts the database, backs up, prepares listmonk, then starts the stack', () => {
    const { status, output, calls } = update({ FAKE_SERVICES: 'caddy app db listmonk' })
    expect(status, output).toBe(0)
    expect(calls).toEqual([
      'docker volume inspect gliagora_db-data',
      'docker compose up -d --wait db',
      'ran backup/backup.sh pre-update',
      'docker compose config --services',
      'ran listmonk/prepare.sh ',
      'docker compose up -d --wait --wait-timeout 300 --remove-orphans',
      'docker compose ps',
    ])
  })

  it('backs nothing up on the first start, and skips listmonk where the stack has none', () => {
    const { status, calls } = update({ FAKE_NO_VOLUME: '1', FAKE_SERVICES: 'caddy app db' })
    expect(status).toBe(0)
    expect(calls).not.toContain('ran backup/backup.sh pre-update')
    expect(calls).not.toContain('ran listmonk/prepare.sh ')
    expect(calls).toContain('docker compose up -d --wait db')
  })

  it('fails when the stack does not become healthy, saying how to go back', () => {
    const { status, output } = update({ FAKE_SERVICES: 'app db', FAKE_UP_EXIT: '1' })
    expect(status).toBe(1)
    expect(output).toContain('by setting only APP_IMAGE in .env (README.md, step 6)')
  })
})

describe('deploy-remote.sh', () => {
  it('rolls back by setting only APP_IMAGE, keeping a secret added since the last deploy', () => {
    const dir = folder()
    const env = join(dir, '.env')
    writeFileSync(
      env,
      'SITE_DOMAIN=example.org\nAPP_IMAGE=ghcr.io/owner/gliagora:sha-bbbbbbb\nLISTMONK_API_TOKEN=new\n',
    )
    sourced('deploy/deploy-remote.sh', 'set_app_image "$ENV" ghcr.io/owner/gliagora:sha-aaaaaaa', {
      ENV: env,
    })
    expect(readFileSync(env, 'utf8')).toBe(
      'SITE_DOMAIN=example.org\nAPP_IMAGE=ghcr.io/owner/gliagora:sha-aaaaaaa\nLISTMONK_API_TOKEN=new\n',
    )
    expect(() =>
      sourced('deploy/deploy-remote.sh', 'set_app_image "$ENV" "x|y"', { ENV: env }),
    ).toThrow()
  })

  it('names the services that are not running and healthy', () => {
    const lines = [
      'caddy running healthy',
      'app running healthy',
      'db running healthy',
      'listmonk running unhealthy',
      'other exited ',
      'plain running ',
    ].join('\n')
    expect(sourced('deploy/deploy-remote.sh', 'unhealthy_services', {}, `${lines}\n`)).toBe(
      'listmonk other\n',
    )
  })

  it('pulls only the app’s image, and never copies the whole previous .env back', () => {
    const script = read('deploy/deploy-remote.sh')
    expect(script).toContain('APP_IMAGE="$image" compose pull app\n')
    expect(script).not.toMatch(/cp -p "\$ENV_FILE\.previous" "\$ENV_FILE"/)
    // A healthy app is not rolled back because another service failed.
    expect(script.indexOf('if [[ "$(app_health)" == healthy ]]')).toBeLessThan(
      script.indexOf('# 6. Automatic rollback'),
    )
  })
})

describe('listmonk/prepare.sh', () => {
  const PREPARE = 'deploy/listmonk/prepare.sh'

  it('reads .env as Compose does, without sourcing it', () => {
    const dir = folder()
    const env = join(dir, '.env')
    writeFileSync(
      env,
      [
        'EMAIL_FROM=Gliagora <hello@gliagora.com>',
        'QUOTED="two words"',
        "SINGLE='x y'",
        'TWICE=first',
        'TWICE=second',
        'EMPTY=',
        '',
      ].join('\n'),
    )
    const value = (name: string) =>
      sourced(PREPARE, `ENV_FILE="$ENV"; env_value ${name}`, { ENV: env })
    expect(value('EMAIL_FROM')).toBe('Gliagora <hello@gliagora.com>')
    expect(value('QUOTED')).toBe('two words')
    expect(value('SINGLE')).toBe('x y')
    expect(value('TWICE')).toBe('second')
    expect(value('EMPTY')).toBe('')
    expect(value('MISSING')).toBe('')
  })

  const input = (env: Record<string, string>) => sourced(PREPARE, 'settings_input', env)
  const param = (sqlText: string, key: string) =>
    new RegExp(`values \\('${key}', '((?:[^']|'')*)'\\);`).exec(sqlText)?.[1]

  it('gives settings.sql the hash of the token, never the token', () => {
    const sqlText = input({ LISTMONK_API_TOKEN: 'the-token' })
    expect(sqlText).not.toContain('the-token')
    expect(param(sqlText, 'api_token_sha256')).toBe(
      createHash('sha256').update('the-token').digest('hex'),
    )
    // One transaction, after a setting that keeps a failed statement out of the server's log.
    expect(sqlText.startsWith('set log_min_error_statement = panic;\nbegin;\n')).toBe(true)
    expect(sqlText.trimEnd().endsWith('commit;')).toBe(true)
    expect(sqlText).toContain(read('deploy/listmonk/settings.sql'))
    // Without SMTP_HOST, nothing about SMTP.
    for (const key of ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_tls']) {
      expect(param(sqlText, key)).toBe('')
    }
    expect(param(sqlText, 'root_url')).toBe('http://localhost:9001')
  })

  it('reads SMTP as the app does: STARTTLS required, TLS with SMTP_SECURE, none on this computer', () => {
    const smtp = (env: Record<string, string>) => {
      const sqlText = input({ LISTMONK_API_TOKEN: 't', ...env })
      return {
        host: param(sqlText, 'smtp_host'),
        port: param(sqlText, 'smtp_port'),
        user: param(sqlText, 'smtp_user'),
        password: param(sqlText, 'smtp_password'),
        tls: param(sqlText, 'smtp_tls'),
      }
    }
    expect(
      smtp({
        SMTP_HOST: ' smtp.example.org ',
        SMTP_USER: 'mailer@example.org',
        SMTP_PASS: "it's \\ secret",
      }),
    ).toEqual({
      host: 'smtp.example.org',
      port: '587',
      user: 'mailer@example.org',
      password: "it''s \\ secret",
      tls: 'STARTTLS',
    })
    expect(smtp({ SMTP_HOST: 'smtp.example.org', SMTP_SECURE: 'TRUE' })).toMatchObject({
      port: '465',
      tls: 'TLS',
      // No user: no password.
      password: '',
    })
    expect(smtp({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_PASS: 'x' })).toMatchObject({
      port: '1025',
      tls: 'none',
      password: '',
    })
    expect(smtp({ SMTP_HOST: 'smtp.example.org', SMTP_PORT: '99999' }).port).toBe('587')
  })
})

describe('backup/alert.sh', () => {
  const SCRIPT = join(DEPLOY, 'backup/alert.sh')
  const PASSWORD = 's3cr"et\\pass word'

  function alert(
    unit: string,
    result: string,
    {
      env = {},
      backup = {},
    }: { env?: Record<string, string>; backup?: Record<string, string> } = {},
  ) {
    const dir = folder()
    const settings = {
      SMTP_HOST: 'smtp.example.org',
      SMTP_PORT: '587',
      SMTP_USER: 'mailer@example.org',
      SMTP_PASS: PASSWORD,
      EMAIL_FROM: 'Gliagora <hello@gliagora.com>',
      ...env,
    }
    writeFileSync(
      join(dir, '.env'),
      Object.entries(settings)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    )
    const backupSettings = { COMPOSE_DIR: dir, ALERT_EMAIL: 'operator@example.org', ...backup }
    writeFileSync(
      join(dir, 'backup.env'),
      Object.entries(backupSettings)
        .map(([key, value]) => `${key}="${value}"\n`)
        .join(''),
    )
    chmodSync(join(dir, '.env'), 0o600)
    const run = runScript(SCRIPT, [unit], {
      BACKUP_CONFIG: join(dir, 'backup.env'),
      FAKE_LOG: dir,
      SERVICE_RESULT: result,
      EXIT_STATUS: result === 'success' ? '0' : '1',
      INVOCATION_ID: '0123456789abcdef0123456789abcdef',
    })
    const file = (name: string) => {
      try {
        return readFileSync(join(dir, name), 'utf8')
      } catch {
        return null
      }
    }
    return {
      ...run,
      args: file('curl.args')?.trim().split('\n') ?? null,
      config: file('curl.config'),
      mail: file('curl.mail'),
    }
  }

  it('emails a failure through the mail server, STARTTLS required, the password never in a command line', () => {
    const { status, output, args, config, mail } = alert('gliagora-backup', 'exit-code')
    expect(status, output).toBe(0)
    expect(args).toEqual(
      expect.arrayContaining(['--ssl-reqd', '--url', 'smtp://smtp.example.org:587', '--crlf']),
    )
    expect(args?.[args.indexOf('--mail-from') + 1]).toBe('hello@gliagora.com')
    expect(args?.[args.indexOf('--mail-rcpt') + 1]).toBe('operator@example.org')
    expect(args).not.toContain('-v')
    expect(JSON.stringify(args)).not.toContain('s3cr')
    // The login in a config file read through a file descriptor, quoted for curl.
    expect(args?.[args.indexOf('-K') + 1]).toMatch(/^\/dev\/fd\/\d+$/)
    expect(config).toBe('user = "mailer@example.org:s3cr\\"et\\\\pass word"\n')
    expect(mail).toMatch(/^From: Gliagora <hello@gliagora\.com>\nTo: operator@example\.org\n/)
    expect(mail).toContain('Subject: [gliagora] backup failed\n')
    expect(mail).toContain('Auto-Submitted: auto-generated\n')
    expect(mail).toContain('Content-Type: text/plain; charset=UTF-8\n')
    // The run's own lines, by its invocation ID, without anyone's address or other programs' lines.
    expect(mail).toContain('[2026-10-04T00:30:02Z] ERROR: pg_dump failed for gliagora')
    expect(mail).toContain('[2026-10-04T00:30:02Z] Note for [address]')
    expect(mail).not.toContain('example.org)')
    expect(mail).not.toContain('pg_dump: error')
    expect(mail).not.toContain('alert: an earlier line')
    expect(mail).not.toContain('s3cr')
    expect(output).toContain('sent "[gliagora] backup failed" to ALERT_EMAIL')
    expect(output).not.toContain('operator@example.org')
  })

  it('uses TLS from the start with SMTP_SECURE, and no TLS only on this computer', () => {
    const secure = alert('gliagora-backup', 'exit-code', {
      env: { SMTP_SECURE: 'true', SMTP_PORT: '' },
    })
    expect(secure.args).toEqual(expect.arrayContaining(['--url', 'smtps://smtp.example.org:465']))
    expect(secure.args).toContain('--ssl-reqd')
    const local = alert('gliagora-backup', 'exit-code', {
      env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_USER: '', SMTP_PASS: '' },
    })
    expect(local.args).toEqual(expect.arrayContaining(['--url', 'smtp://127.0.0.1:1025']))
    expect(local.args).not.toContain('--ssl-reqd')
    // No login: no config file.
    expect(local.args).not.toContain('-K')
    expect(local.config).toBeNull()
  })

  it('sends nothing without SMTP_HOST or ALERT_EMAIL ("alerts off")', () => {
    for (const run of [
      alert('gliagora-backup', 'exit-code', { env: { SMTP_HOST: '' } }),
      alert('gliagora-backup', 'exit-code', { backup: { ALERT_EMAIL: '' } }),
    ]) {
      expect(run.status).toBe(0)
      expect(run.output).toContain('alerts off')
      expect(run.args).toBeNull()
    }
  })

  it('emails the restore test’s success, and fails when the email could not be sent', () => {
    const passed = alert('gliagora-restore-test', 'success')
    expect(passed.mail).toContain('Subject: [gliagora] restore test passed\n')
    const refused = runScript(SCRIPT, ['gliagora-restore-test'], {})
    expect(refused.status).toBe(0) // without backup.env: alerts off
    const dir = folder()
    writeFileSync(join(dir, '.env'), 'SMTP_HOST=smtp.example.org\n')
    writeFileSync(join(dir, 'backup.env'), `COMPOSE_DIR=${dir}\nALERT_EMAIL=operator@example.org\n`)
    const failed = runScript(SCRIPT, ['gliagora-backup'], {
      BACKUP_CONFIG: join(dir, 'backup.env'),
      FAKE_LOG: dir,
      FAKE_CURL_EXIT: '67',
      SERVICE_RESULT: 'exit-code',
    })
    expect(failed.status).toBe(1)
    expect(failed.output).toContain('could not send "[gliagora] backup failed"')
  })

  it('emails a success only for the restore test and the Sunday backup', () => {
    const decide = (unit: string, result: string, weekday: number) =>
      sourced(
        'deploy/backup/alert.sh',
        `should_alert ${unit} ${result} ${weekday} && echo yes || echo no`,
      ).trim()
    expect(decide('gliagora-backup', 'exit-code', 3)).toBe('yes')
    expect(decide('gliagora-backup', 'success', 3)).toBe('no')
    expect(decide('gliagora-backup', 'success', 7)).toBe('yes')
    expect(decide('gliagora-restore-test', 'success', 3)).toBe('yes')
    expect(decide('gliagora-restore-test', 'timeout', 3)).toBe('yes')
  })
})
