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

import { afterEach, describe, expect, it, vi } from 'vitest'

import { listmonkParams } from '@/scripts/listmonk-settings'

// The server's scripts in deploy/ (M2, D50), run by bash against stand-ins for curl, docker, restic
// and journalctl (tests/fixtures/deploy/bin; listmonk's program in tests/fixtures/deploy/listmonk)
// or sourced for their functions, as src/lib/restore-carry.test.ts does for the carry-over. None
// of them runs anything for real. listmonk/prepare.sh runs whole here, against the docker
// stand-in; CI (.github/workflows/ci.yml) repeats its steps with Docker and a real listmonk (the
// same init script, the same install command and the same psql input), not the script itself,
// and the server is checked by hand (deploy/README.md).

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
        // Each exits with its own setting: BACKUP_EXIT, PREPARE_EXIT (default 0).
        `#!/usr/bin/env bash\necho "ran ${script} $*" >>"$FAKE_LOG/docker.log"\nexit "\${${script.startsWith('backup') ? 'BACKUP' : 'PREPARE'}_EXIT:-0}"\n`,
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

  it('stops before anything else when the backup fails', () => {
    const { status, calls } = update({ FAKE_SERVICES: 'caddy app db listmonk', BACKUP_EXIT: '1' })
    expect(status).toBe(1)
    expect(calls.at(-1)).toBe('ran backup/backup.sh pre-update')
  })

  it('fails when the stack does not become healthy, saying how to go back', () => {
    const { status, output } = update({ FAKE_SERVICES: 'app db', FAKE_UP_EXIT: '1' })
    expect(status).toBe(1)
    expect(output).toContain('by setting only APP_IMAGE in .env (README.md, step 6)')
  })

  it('starts everything but listmonk when listmonk cannot be prepared, then fails naming it', () => {
    // Nothing depends on listmonk: the app's deploy goes on, and listmonk is neither recreated
    // nor started on settings that were not applied.
    const { status, output, calls } = update({
      FAKE_SERVICES: 'caddy app db listmonk',
      PREPARE_EXIT: '1',
    })
    expect(status).toBe(3)
    expect(calls.slice(-3)).toEqual([
      'ran listmonk/prepare.sh ',
      'docker compose up -d --wait --wait-timeout 300 --remove-orphans caddy app db',
      'docker compose ps',
    ])
    expect(output).toContain('listmonk could not be prepared (see above): it is left as it is')
    expect(output).toContain('updated and healthy without listmonk')
    // And if the rest does not become healthy either: the usual failure, which names listmonk too.
    const both = update({
      FAKE_SERVICES: 'caddy app db listmonk',
      PREPARE_EXIT: '1',
      FAKE_UP_EXIT: '1',
    })
    expect(both.status).toBe(1)
    expect(both.output).toContain('listmonk could not be prepared either')
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
    // update.sh's exit code for listmonk is the one deploy-remote.sh knows.
    expect(read('deploy/update.sh')).toContain('LISTMONK_NOT_PREPARED=3\n')
    expect(script).toContain('LISTMONK_NOT_PREPARED=3\n')
  })

  it('rolls back only an unhealthy new image, never a healthy app for another service’s sake', () => {
    const NEW = 'ghcr.io/owner/gliagora:sha-bbbbbbb'
    const verdict = (status: number, env: Record<string, string>) => {
      const dir = folder()
      return sourced('deploy/deploy-remote.sh', `failed_update ${status} ${NEW}`, {
        PATH: `${FAKE_BIN}:${process.env.PATH}`,
        FAKE_LOG: dir,
        ...env,
      }).trim()
    }
    // The update stopped before the app was restarted: the old image still runs.
    expect(verdict(1, { FAKE_APP_IMAGE: 'ghcr.io/owner/gliagora:sha-aaaaaaa' })).toBe(
      'not-restarted',
    )
    // The new image runs but is not healthy: roll back.
    for (const health of ['unhealthy', 'starting', '']) {
      expect(verdict(1, { FAKE_APP_IMAGE: NEW, FAKE_APP_HEALTH: health })).toBe('rollback')
    }
    // Healthy: listmonk could not be prepared (update.sh's 3), even while listmonk itself still
    // runs healthy on the old settings, or another service is not healthy.
    const healthy = { FAKE_APP_IMAGE: NEW, FAKE_APP_HEALTH: 'healthy' }
    expect(
      verdict(3, { ...healthy, FAKE_PS: 'app running healthy;listmonk running healthy' }),
    ).toBe('listmonk')
    expect(
      verdict(1, { ...healthy, FAKE_PS: 'app running healthy;listmonk running unhealthy' }),
    ).toBe('others listmonk')
    expect(verdict(1, { ...healthy, FAKE_PS: 'app running healthy' })).toBe('others')
  })
})

describe('listmonk/prepare.sh', () => {
  const PREPARE = 'deploy/listmonk/prepare.sh'

  it('reads .env only where Compose reads it the same way, without sourcing it', () => {
    const dir = folder()
    const env = join(dir, '.env')
    const lines: Record<string, string> = {
      EMAIL_FROM: 'EMAIL_FROM=Gliagora <hello@gliagora.com>',
      QUOTED: 'QUOTED="two words"',
      SINGLE: `SINGLE='a$b#c\\d "q" it'`,
      ITS: "ITS=it's",
      EMPTY: 'EMPTY=',
      EMPTY_QUOTES: "EMPTY_QUOTES=''",
      // Compose: $$ is $, $x a variable, \" and \$ escapes, " #" a comment, and the rest it
      // reads too, but differently or not at all; so each is refused, naming only the variable.
      DOLLARS: 'DOLLARS=Ab$$9',
      VARIABLE: 'VARIABLE=$HOME',
      ESCAPED_QUOTE: 'ESCAPED_QUOTE="a\\"b"',
      ESCAPED_DOLLAR: 'ESCAPED_DOLLAR="a\\$b"',
      DOUBLE_DOLLAR: 'DOUBLE_DOLLAR="x$y"',
      COMMENT: 'COMMENT=pass # note',
      HASH: 'HASH=a#b',
      BACKSLASH: 'BACKSLASH=a\\b',
      EXPORTED: 'export EXPORTED=v',
      SPACED: 'SPACED = v',
      COLON: 'COLON: v',
      INDENTED: '  INDENTED=v',
      TRAILING: 'TRAILING=v  ',
      TRAILING_QUOTED: "TRAILING_QUOTED='v' ",
      CARRIAGE: 'CARRIAGE=v\r',
      OPEN: "OPEN='v",
      SPLIT: "SPLIT='a'b'",
      ESCAPED_END: "ESCAPED_END='v\\'",
    }
    writeFileSync(
      env,
      `${Object.values(lines).join('\n')}\nTWICE=first\nTWICE=second\nLATER=ok\nLATER=$$\n`,
    )
    const value = (name: string) =>
      sourced(PREPARE, `ENV_FILE="$ENV"; env_value ${name}`, { ENV: env })
    expect(value('EMAIL_FROM')).toBe('Gliagora <hello@gliagora.com>')
    expect(value('QUOTED')).toBe('two words')
    // Single quotes: taken as written, by Compose too.
    expect(value('SINGLE')).toBe('a$b#c\\d "q" it')
    expect(value('ITS')).toBe("it's")
    expect(value('EMPTY')).toBe('')
    expect(value('EMPTY_QUOTES')).toBe('')
    expect(value('TWICE')).toBe('second')
    expect(value('MISSING')).toBe('')
    const refused = [
      ...Object.keys(lines).slice(6),
      // A line Compose reads differently refuses the key even when a later line is fine.
      'LATER',
    ]
    expect(refused).toHaveLength(19)
    for (const name of refused) {
      let failure: { status?: number; stderr?: string } = {}
      try {
        value(name)
      } catch (error) {
        failure = error as typeof failure
      }
      expect(failure.status, name).toBe(1)
      expect(failure.stderr).toContain(`${name} in ${env} is written in a way Docker Compose`)
      expect(failure.stderr).toContain(`put its value in single quotes (${name}='…')`)
      // Never the value as written.
      const line = lines[name] ?? ''
      const written = line.slice(line.indexOf(name) + name.length + 1).trim()
      if (written.length > 2) expect(failure.stderr).not.toContain(written)
    }
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

  it('gives settings.sql the same parameters as the node-postgres runner (pnpm listmonk:setup)', () => {
    // The server's way (prepare.sh's psql input) and the tests' and CI's (listmonkParams, which
    // reads SMTP as the app does): the same mail server, login, TLS and token, for every kind of
    // setting. tests/integration/listmonk.db.test.ts checks that both store the same.
    const keys = Object.keys(listmonkParams({ LISTMONK_API_TOKEN: 't' }))
    expect(keys).toHaveLength(7)
    const cases: Record<string, string>[] = [
      {},
      { SMTP_HOST: 'smtp.example.org' },
      {
        SMTP_HOST: ' smtp.example.org ',
        SMTP_USER: ' mailer@example.org ',
        SMTP_PASS: "it's $ \\",
      },
      { SMTP_HOST: 'smtp.example.org', SMTP_SECURE: 'TRUE', SMTP_USER: 'm', SMTP_PASS: 'p w' },
      { SMTP_HOST: 'smtp.example.org', SMTP_SECURE: 'false', SMTP_PORT: '2525' },
      { SMTP_HOST: 'smtp.example.org', SMTP_PORT: '99999' },
      { SMTP_HOST: 'smtp.example.org', SMTP_PORT: 'abc', SMTP_SECURE: 'true' },
      { SMTP_HOST: 'localhost', SMTP_PORT: '1025', SMTP_USER: 'u', SMTP_PASS: 'x' },
      { SMTP_HOST: '127.0.0.1', SMTP_PASS: 'without a user' },
      { SMTP_HOST: '[::1]', SMTP_PORT: '025' },
    ]
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (const smtp of cases) {
        const env = {
          LISTMONK_API_TOKEN: ' the-token ',
          LISTMONK_ROOT_URL: 'http://localhost:9001',
          ...smtp,
        }
        const sqlText = input(env)
        const bash = Object.fromEntries(
          keys.map((key) => [key, (param(sqlText, key) ?? 'missing').replaceAll("''", "'")]),
        )
        expect(bash, JSON.stringify(smtp)).toEqual(listmonkParams(env))
      }
    } finally {
      quiet.mockRestore()
    }
  })
})

describe('listmonk/prepare.sh, run as on the server', () => {
  const PREPARE_FILE = 'deploy/listmonk/prepare.sh'
  const PREPARE = join(ROOT, PREPARE_FILE)

  /** Runs prepare.sh against the docker stand-in, with its own .env and admin password file. */
  function prepare(env: Record<string, string> = {}, dotenv = "LISTMONK_API_TOKEN='the-token'\n") {
    const dir = folder()
    writeFileSync(join(dir, 'compose.prod.yml'), 'name: gliagora\n')
    writeFileSync(join(dir, '.env'), dotenv)
    const passwordFile = join(dir, 'admin-password')
    const run = runScript(PREPARE, [], {
      COMPOSE_DIR: dir,
      LISTMONK_ADMIN_PASSWORD_FILE: passwordFile,
      FAKE_LOG: dir,
      ...env,
    })
    const file = (name: string) => {
      try {
        return readFileSync(join(dir, name), 'utf8')
      } catch {
        return ''
      }
    }
    const calls = file('docker.log')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.replace(/--project-directory \S+ -f \S+ /, ''))
    return { ...run, calls, file, passwordFile }
  }

  const INIT = 'docker compose exec -T db bash /docker-entrypoint-initdb.d/20-listmonk-database.sh'
  const RUNNING = 'docker compose ps -q --status running listmonk'
  const INSTALLED = `docker compose exec -T db psql -U postgres -d listmonk -X -tAc select to_regclass('public.settings') is not null`
  const UPGRADE =
    'docker compose run --rm -T --no-deps listmonk ./listmonk --upgrade --yes --config '
  const SETTINGS =
    'docker compose exec -T db psql -U postgres -d listmonk -X -q -tA -v ON_ERROR_STOP=1'
  const RECREATE = 'docker compose up -d --no-deps --force-recreate listmonk'

  it('installs listmonk once, its admin password on stdin only, then applies the settings', () => {
    const { status, output, calls, file, passwordFile } = prepare()
    expect(status, output).toBe(0)
    expect(calls[0]).toBe(INIT)
    expect(calls[1]).toBe(RUNNING)
    expect(calls[2]).toBe(INSTALLED)
    expect(calls[3]).toMatch(/^docker compose run --rm -T --no-deps listmonk sh -c /)
    expect(calls.slice(4)).toEqual([UPGRADE, SETTINGS])
    // The password was made for it (only its owner can read it) and reached listmonk on stdin,
    // through the shell's `read` in the container, never in a command line.
    const password = readFileSync(passwordFile, 'utf8').trim()
    expect(password).toMatch(/^[0-9a-f]{40}$/)
    expect(statSync(passwordFile).mode & 0o777).toBe(0o600)
    expect(file('listmonk.admin')).toBe(`gliagora-admin\n${password}\n`)
    expect(file('listmonk.log')).toBe(
      '--install --idempotent --yes --config \n--upgrade --yes --config \n',
    )
    expect(file('docker.log')).not.toContain(password)
    expect(output).not.toContain(password)
    // settings.sql in one transaction, with the token's hash, never the token.
    expect(file('psql.stdin')).toMatch(/^set log_min_error_statement = panic;\nbegin;\n/)
    expect(file('psql.stdin')).toContain(createHash('sha256').update('the-token').digest('hex'))
    expect(file('psql.stdin')).not.toContain('the-token')
    // Not running before: nothing to start again (update.sh starts it).
    expect(calls).not.toContain(RECREATE)
    expect(output).toContain('No restart needed.')
  })

  it('is repeated in CI with the same install command', () => {
    // CI cannot run the script (it has no compose project of the server); it runs its steps.
    const words = (text = '') =>
      text.replace(`'"$ADMIN_USER"'`, 'gliagora-admin').trim().split(/\s+/).join(' ')
    const server = /listmonk sh -c '([^']*'"\$ADMIN_USER"'[^']*)'/.exec(read(PREPARE_FILE))?.[1]
    const ci = /sh -c '(\s*IFS= read[^']*)'/.exec(read('.github/workflows/ci.yml'))?.[1]
    expect(words(server)).toContain('./listmonk --install --idempotent')
    expect(words(ci)).toBe(words(server))
  })

  it('keeps an admin password that exists, and installs nothing where listmonk is installed', () => {
    const first = prepare({ FAKE_INSTALLED: 't', FAKE_LISTMONK_RUNNING: '1' })
    expect(first.status, first.output).toBe(0)
    expect(first.calls).toEqual([
      INIT,
      RUNNING,
      'docker compose config --images',
      'docker inspect -f {{.Config.Image}} listmonk-container',
      INSTALLED,
      UPGRADE,
      SETTINGS,
    ])
    expect(first.file('listmonk.admin')).toBe('')
    expect(first.output).toContain('Nothing to change.')

    const dir = folder()
    const passwordFile = join(dir, 'kept')
    writeFileSync(passwordFile, 'kept-password\n')
    const kept = prepare({ LISTMONK_ADMIN_PASSWORD_FILE: passwordFile })
    expect(kept.status, kept.output).toBe(0)
    expect(readFileSync(passwordFile, 'utf8')).toBe('kept-password\n')
    expect(kept.file('listmonk.admin')).toBe('gliagora-admin\nkept-password\n')
  })

  it('starts a running listmonk again, recreated, when its settings changed or it was installed', () => {
    const cases = [
      { env: { FAKE_INSTALLED: 't', FAKE_CHANGED: 'setting smtp' }, running: true, again: true },
      { env: { FAKE_INSTALLED: 't' }, running: true, again: false },
      { env: {}, running: true, again: true },
      { env: { FAKE_INSTALLED: 't', FAKE_CHANGED: 'setting smtp' }, running: false, again: false },
      { env: {}, running: false, again: false },
    ]
    for (const { env, running, again } of cases) {
      const run = prepare({ ...env, ...(running ? { FAKE_LISTMONK_RUNNING: '1' } : {}) })
      expect(run.status, run.output).toBe(0)
      expect(run.calls.includes(RECREATE), JSON.stringify({ env, running })).toBe(again)
      // Never a plain restart, which would keep the container's image.
      expect(run.calls.some((call) => call.includes(' restart '))).toBe(false)
      if (again) expect(run.calls.at(-1)).toBe(RECREATE)
    }
  })

  it('stops a listmonk on another image before the new one migrates its database', () => {
    const run = prepare({
      FAKE_INSTALLED: 't',
      FAKE_LISTMONK_RUNNING: '1',
      FAKE_LISTMONK_RUNNING_IMAGE: 'listmonk/listmonk:v0',
      FAKE_LISTMONK_IMAGE: 'listmonk/listmonk:v1@sha256:' + '1'.repeat(64),
    })
    expect(run.status, run.output).toBe(0)
    const stop = run.calls.indexOf('docker compose stop listmonk')
    expect(stop).toBeGreaterThan(-1)
    expect(stop).toBeLessThan(run.calls.indexOf(UPGRADE))
    expect(run.calls.at(-1)).toBe(RECREATE)
    // The same image: left running.
    const same = prepare({
      FAKE_INSTALLED: 't',
      FAKE_LISTMONK_RUNNING: '1',
      FAKE_LISTMONK_RUNNING_IMAGE: 'listmonk/listmonk:v1@sha256:' + '1'.repeat(64),
      FAKE_LISTMONK_IMAGE: 'listmonk/listmonk:v1@sha256:' + '1'.repeat(64),
    })
    expect(same.calls).not.toContain('docker compose stop listmonk')
    expect(same.calls).not.toContain(RECREATE)
  })

  it('fails, changing nothing, without its token, with an unreadable .env line or on a failure', () => {
    const noToken = prepare({}, 'SMTP_HOST=\n')
    expect(noToken.status).toBe(1)
    expect(noToken.output).toContain('Set LISTMONK_API_TOKEN')
    expect(noToken.calls).toEqual([])
    const unreadable = prepare({}, "LISTMONK_API_TOKEN='t'\nSMTP_PASS=Ab$$9\n")
    expect(unreadable.status).toBe(1)
    expect(unreadable.output).toContain('Nothing was changed: correct SMTP_PASS')
    expect(unreadable.output).not.toContain('Ab$')
    expect(unreadable.calls).toEqual([])
    const upgrade = prepare({ FAKE_INSTALLED: 't', FAKE_LISTMONK_EXIT: '1' })
    expect(upgrade.status).toBe(1)
    expect(upgrade.calls.at(-1)).toBe(UPGRADE)
    const settings = prepare({ FAKE_INSTALLED: 't', FAKE_PSQL_EXIT: '3' })
    expect(settings.status).toBe(1)
    expect(settings.output).toContain("listmonk's settings were not applied")
    // Without a password file of its own (the tests'), only root may run it.
    const dir = folder()
    writeFileSync(join(dir, '.env'), "LISTMONK_API_TOKEN='t'\n")
    const notRoot = runScript(PREPARE, [], { COMPOSE_DIR: dir, FAKE_LOG: dir })
    if (process.getuid?.() !== 0) {
      expect(notRoot.status).toBe(1)
      expect(notRoot.output).toContain('Run as root (sudo)')
    }
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
      extra = '',
    }: { env?: Record<string, string>; backup?: Record<string, string>; extra?: string } = {},
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
    // In single quotes, as deploy/.env.example asks; `extra` adds lines as they are.
    writeFileSync(
      join(dir, '.env'),
      Object.entries(settings)
        .map(([key, value]) => `${key}='${value}'\n`)
        .join('') + extra,
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

  it('sends nothing, and fails, when .env holds a mail setting Compose would read differently', () => {
    for (const line of ['SMTP_PASS=Ab$$9xY', 'SMTP_PASS="Ab\\$9xY"', 'EMAIL_FROM=a # b']) {
      const run = alert('gliagora-backup', 'exit-code', { extra: `${line}\n` })
      expect(run.status, line).toBe(1)
      const name = line.slice(0, line.indexOf('='))
      expect(run.output).toContain(`alerts off: ${name} in `)
      expect(run.output).toContain(`put its value in single quotes (${name}='…')`)
      expect(run.output).not.toContain('Ab')
      expect(run.output).not.toContain('s3cr')
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
