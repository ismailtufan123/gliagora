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

  it('runs the Caddy built from deploy/caddy-image, pinned by digest, which CI tests with', () => {
    const image = /image:\s*(\S*caddy\S*)/.exec(service(compose, 'caddy'))?.[1] ?? ''
    const pinned = /^ghcr\.io\/ismailtufan123\/gliagora-caddy:([\w.-]+)@sha256:[0-9a-f]{64}$/.exec(
      image,
    )
    expect(pinned, image).not.toBeNull()
    // The tag is the one of the folder as it is: the version of Caddy and a hash of the build's
    // inputs. A changed input needs a new image and its line here (deploy/caddy-image/README.md).
    const tag = execFileSync(join(DEPLOY, 'caddy-image/tag.sh'), { encoding: 'utf8' }).trim()
    expect(pinned?.[1], 'build the image again and pin it: deploy/caddy-image/README.md').toBe(tag)

    // One version of Caddy: the official image it is put into, the program built, and the tag.
    const dockerfile = read('deploy/caddy-image/Dockerfile')
    const version = /^ARG CADDY_VERSION=(\d+\.\d+\.\d+)$/m.exec(dockerfile)?.[1]
    expect(version).toBeDefined()
    expect(tag.startsWith(`${version}-`)).toBe(true)
    expect(dockerfile).toMatch(
      new RegExp(`^ARG CADDY_IMAGE=caddy:${version}-alpine@sha256:[0-9a-f]{64}$`, 'm'),
    )
    expect(dockerfile).toMatch(/^ARG GO_IMAGE=golang:[\d.]+-alpine@sha256:[0-9a-f]{64}$/m)
    const goMod = read('deploy/caddy-image/go.mod')
    expect(goMod).toMatch(new RegExp(`^\\tgithub\\.com/caddyserver/caddy/v2 v${version}$`, 'm'))
    // The module at one commit, and the sums of everything it is built from.
    expect(goMod).toMatch(/^\tgithub\.com\/mholt\/caddy-ratelimit v[\w.-]+$/m)
    expect(read('deploy/caddy-image/go.sum')).toContain('github.com/mholt/caddy-ratelimit ')

    // Built only by its own workflow, from that folder, under that tag; and the end-to-end tests
    // run the program of the image named here.
    const workflow = read('.github/workflows/caddy-image.yml')
    expect(workflow).toContain('tag=$(deploy/caddy-image/tag.sh)')
    expect(workflow).toContain('context: deploy/caddy-image')
    expect(workflow).toContain('IMAGE: ghcr.io/${{ github.repository }}-caddy')
    const ci = read('.github/workflows/ci.yml')
    const taken = /caddy_image=\$\(grep -oE '([^']+)' deploy\/compose\.prod\.yml/.exec(ci)?.[1]
    expect(taken).toBeDefined()
    expect(new RegExp(taken!.replaceAll('[:space:]', '\\s')).exec(compose)?.[0]).toBe(image)
  })

  it('is what CI tests with: the same PostgreSQL image', () => {
    const image = /image:\s*(postgres:\S+)/.exec(compose)?.[1]
    expect(image).toMatch(/^postgres:[\d.]+@sha256:[0-9a-f]{64}$/)
    expect(/^\s*POSTGRES_IMAGE: (\S+)$/m.exec(read('.github/workflows/ci.yml'))?.[1]).toBe(image)
  })

  it('keeps addresses out of PostgreSQL’s log, the same way locally and in CI', () => {
    // An error's DETAIL can quote a value (a duplicate address); the failed statement too.
    const flags = ['log_error_verbosity=terse', 'log_min_error_statement=panic']
    const command = `command: [postgres, -c, ${flags.join(', -c, ')}]\n`
    expect(service(compose, 'db')).toContain(command)
    expect(service(local, 'db')).toContain(command)
    expect(read('.github/workflows/ci.yml')).toContain(
      `"$POSTGRES_IMAGE" postgres -c ${flags.join(' -c ')}\n`,
    )
  })

  it('checks the database over TCP, never the socket of a new volume’s set-up', () => {
    expect(service(compose, 'db')).toContain(
      "test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U postgres -d gliagora']",
    )
    expect(service(local, 'db')).toContain('pg_isready -h 127.0.0.1 ')
  })

  /**
   * The lines of listmonk's `ports:` list that do not publish on the loopback, as
   * `- '127.0.0.1:HOST:CONTAINER'` (quoted either way, or not): every other entry, such as
   * `- 9000:9000`, `- 0.0.0.0:…` or the long form (`- target: …`, `published: …`), counts.
   * Comments and blank lines aside. Undefined when there is no list.
   */
  const publicPorts = (text: string) => {
    const ports = /\n {4}ports:\n((?: {6,}.*\n|[ \t]*\n)+)/.exec(service(text, 'listmonk'))?.[1]
    if (ports === undefined) return undefined
    const entries = ports.split('\n').filter((line) => line.trim() && !/^\s*#/.test(line))
    if (entries.length === 0) return undefined
    return entries.filter((line) => !/^ {6}- (['"]?)127\.0\.0\.1:\d+:\d+\1$/.test(line))
  }

  it('publishes listmonk on the server’s loopback only, and nothing depends on it', () => {
    for (const text of [compose, local]) expect(publicPorts(text)).toEqual([])
    // Any other entry added next to it is caught, in every form Docker accepts.
    const loopback = "      - '127.0.0.1:9000:9000'\n"
    expect(compose).toContain(loopback)
    for (const extra of [
      '      - 9000:9000\n',
      '      - 0.0.0.0:9001:9000\n',
      '      - "0.0.0.0:9001:9000"\n',
      "      - '9001:9000'\n",
      '      - target: 9000\n        published: 9001\n',
      '      - target: 9000\n        host_ip: 127.0.0.1\n        published: 9001\n',
    ]) {
      expect(publicPorts(compose.replace(loopback, loopback + extra)), extra).not.toEqual([])
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
    const journald = read('deploy/logs/zz-gliagora.conf')
    expect(journald).toMatch(/^MaxRetentionSec=14day$/m)
    expect(journald).toMatch(/^ForwardToSyslog=no$/m)
    // New servers get it from setup-server.sh.
    expect(read('deploy/setup-server.sh')).toContain('bash "$SCRIPT_DIR/logs/install-journald.sh"')
    expect(read('deploy/logs/install-journald.sh')).toContain('zz-gliagora.conf')
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

  function backup(
    databases: string,
    onServer: string,
    {
      tag = 'pre-update',
      env = {},
      settings = false,
    }: { tag?: string; env?: Record<string, string>; settings?: boolean } = {},
  ) {
    const dir = folder()
    writeFileSync(join(dir, '.env'), 'SITE_DOMAIN=example.org\n')
    // Every settings file and folder the server has (`settings`), or only .env.
    if (settings) {
      for (const file of ['admin-auth.caddy', 'compose.prod.yml', 'Caddyfile']) {
        writeFileSync(join(dir, file), '# test\n')
      }
      for (const folderName of ['postgres', 'listmonk', 'basemap']) {
        execFileSync('mkdir', ['-p', join(dir, folderName)])
        writeFileSync(join(dir, folderName, 'file'), '# test\n')
      }
    }
    writeFileSync(
      join(dir, 'backup.env'),
      `COMPOSE_DIR=${dir}\nRESTIC_REPOSITORY=${dir}/missing-repository\nRESTIC_PASSWORD_FILE=${dir}/pw\nDATABASES="${databases}"\n`,
    )
    const result = runScript(SCRIPT, [tag], {
      BACKUP_CONFIG: join(dir, 'backup.env'),
      FAKE_LOG: dir,
      FAKE_DATABASES: onServer,
      ...env,
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

  it('dumps each listed database with its own exclusions', () => {
    const { status, output, docker, restic } = backup('gliagora listmonk', 'gliagora listmonk')
    expect(status, output).toBe(0)
    expect(docker).toMatch(/pg_dump .*--exclude-table-data=public\.email_tokens gliagora\n/)
    expect(docker).toMatch(
      /pg_dump -U postgres --format=custom --compress=0 --exclude-table-data=public\.sessions listmonk\n/,
    )
    expect(restic).toContain('--stdin-filename listmonk.dump')
    expect(restic).toContain('--tag db:listmonk')
  })

  it('backs up the settings one by one, listmonk’s set-up included, never a whole folder', () => {
    const { status, output, restic, dir } = backup('gliagora', 'gliagora', { settings: true })
    expect(status, output).toBe(0)
    // Exactly these, in this order: never /opt/gliagora itself or the basemap.
    const settings = ['.env', 'admin-auth.caddy', 'compose.prod.yml', 'Caddyfile', 'postgres']
    const files = [...settings, 'listmonk', 'backup.env'].map((name) => `${dir}/${name}`)
    expect(restic).toContain(
      `restic backup --host gliagora --tag pre-update --tag config --quiet ${files.join(' ')}\n`,
    )
  })

  it('skips the settings that do not exist on the server', () => {
    const { status, restic, dir } = backup('gliagora', 'gliagora')
    expect(status).toBe(0)
    expect(restic).toContain(`--tag config --quiet ${dir}/.env ${dir}/backup.env\n`)
  })

  it('skips a listed database the server does not have yet (listmonk before its install)', () => {
    // Never backed up: the first update, whose backup runs before listmonk/prepare.sh makes it.
    for (const tag of ['pre-update', 'nightly']) {
      const { status, output, docker, restic } = backup('gliagora listmonk', 'gliagora', { tag })
      expect(status, output).toBe(0)
      expect(output).toContain(
        'Database listmonk is in DATABASES but not on the server yet (never backed up): skipped',
      )
      expect(docker).not.toMatch(/pg_dump .* listmonk\n/)
      expect(restic).toContain(
        'restic snapshots --host gliagora --tag db:listmonk --latest 1 --json',
      )
    }
  })

  it('fails, after storing the others, when a database backed up before is gone', () => {
    for (const tag of ['nightly', 'pre-update']) {
      const { status, output, docker } = backup('gliagora listmonk', 'gliagora', {
        tag,
        env: { FAKE_SNAPSHOTS: 'listmonk' },
      })
      expect(status, tag).toBe(1)
      expect(docker).toMatch(/pg_dump .* gliagora\n/)
      expect(output).toContain('was backed up before, but the server no longer has it')
      expect(output).toContain('names listmonk, which the server no longer has')
      expect(output).not.toContain('Backup finished')
    }
    // A question the repository cannot answer is never taken for "never backed up".
    const unknown = backup('gliagora listmonk', 'gliagora', {
      tag: 'nightly',
      env: { FAKE_RESTIC_SNAPSHOTS_EXIT: '1' },
    })
    expect(unknown.status).toBe(1)
    expect(unknown.output).toContain('could not say whether it was backed up before')
    // Before a restore, there is nothing of it to keep, and the restore must not be blocked.
    const restoring = backup('gliagora listmonk', 'gliagora', {
      tag: 'pre-restore',
      env: { FAKE_SNAPSHOTS: 'listmonk' },
    })
    expect(restoring.status, restoring.output).toBe(0)
    expect(restoring.output).toContain('nothing of it to keep before the restore')
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

  function restore(args: string[], snapshots: string, env: Record<string, string> = {}) {
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
      ...env,
    })
    const log = (name: string) => {
      try {
        return readFileSync(join(dir, name), 'utf8')
      } catch {
        return '' // Not called.
      }
    }
    return { ...result, docker: log('docker.log'), restic: log('restic.log') }
  }

  /** A snapshot ID of the order-keeping restic stand-in's state. */
  const id = (n: number) => n.toString(16).padStart(64, '0')

  /** The stand-in's state: the old server's last night, then later backups. */
  function snapshots(...later: string[]) {
    const file = join(folder(), 'snapshots')
    writeFileSync(
      file,
      [
        `${id(1)} 1790900000 nightly,db:gliagora`,
        `${id(2)} 1790900000 nightly,db:listmonk`,
        `${id(3)} 1790900000 nightly,config`,
        ...later,
      ].join('\n') + '\n',
    )
    return file
  }

  it('restores `database latest` from the newest backup, never from an earlier restore’s safety backup', () => {
    // On a new server: restoring gliagora first took a safety backup of every database, the new
    // server's empty listmonk included (README, step 7). listmonk's `latest` must still be the
    // old server's, whatever order restic lists the snapshots in, and stays so after this restore
    // takes its own safety backup.
    const state = snapshots(
      `${id(4)} 1790990000 pre-restore,db:gliagora`,
      `${id(5)} 1790990000 pre-restore,db:listmonk`,
    )
    for (const newestFirst of ['', '1', '']) {
      const run = restore(['database', 'latest', 'listmonk', '--yes'], '', {
        FAKE_RESTIC_STATE: state,
        FAKE_RESTIC_NEWEST_FIRST: newestFirst,
        FAKE_DATABASES: 'gliagora listmonk',
      })
      expect(run.status, run.output).toBe(0)
      expect(run.restic).toContain(`restic dump ${id(2)} /listmonk.dump\n`)
      expect(run.output).toContain('Restore finished.')
    }
    expect(readFileSync(state, 'utf8').match(/ pre-restore,db:listmonk$/gm)).toHaveLength(4)
    // A pre-update snapshot newer than the night is the newest backup: it counts.
    const updated = snapshots(`${id(6)} 1790950000 pre-update,db:listmonk`)
    const run = restore(['database', 'latest', 'listmonk', '--yes'], '', {
      FAKE_RESTIC_STATE: updated,
      FAKE_DATABASES: 'gliagora listmonk',
    })
    expect(run.restic).toContain(`restic dump ${id(6)} /listmonk.dump\n`)
    // `test latest` checks the newest of all, safety backups included.
    const tested = restore(['test', 'latest', 'listmonk'], '', { FAKE_RESTIC_STATE: state })
    expect(tested.status, tested.output).toBe(0)
    expect(tested.restic).toMatch(/restic dump (\S+) \/listmonk\.dump\n/)
    expect(tested.restic).not.toContain(`restic dump ${id(2)} `)
    // Without a snapshot other than safety backups, it says so and changes nothing.
    const only = join(folder(), 'snapshots')
    writeFileSync(only, `${id(8)} 1790990000 pre-restore,db:listmonk\n`)
    const none = restore(['database', 'latest', 'listmonk', '--yes'], '', {
      FAKE_RESTIC_STATE: only,
    })
    expect(none.status).toBe(1)
    expect(none.output).toContain('No snapshot with tag db:listmonk (other than pre-restore).')
    expect(none.docker).toBe('')
  })

  it('takes PUBLIC’s access to a recreated database away before restoring into it', () => {
    const run = restore(['database', 'latest', 'listmonk', '--yes'], 'gliagora listmonk', {
      FAKE_DATABASES: 'gliagora listmonk',
    })
    expect(run.status, run.output).toBe(0)
    const calls = run.docker.split('\n')
    const created = calls.findIndex((call) =>
      call.includes(' createdb -U postgres --owner listmonk listmonk'),
    )
    const revoked = calls.findIndex((call) =>
      call.endsWith('-X -q -v ON_ERROR_STOP=1 -c REVOKE ALL ON DATABASE "listmonk" FROM PUBLIC'),
    )
    const restored = calls.findIndex((call) =>
      call.includes(' pg_restore -U postgres -d listmonk '),
    )
    expect(created).toBeGreaterThan(-1)
    expect(revoked).toBe(created + 1)
    expect(restored).toBeGreaterThan(revoked)
  })

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
    // listmonk's check reads its own migration record; only the app's database carries rows (one
    // question for each carried table: the deletion log, the data requests, the consent log).
    expect(docker).toContain("select count(*) from settings where key = 'migrations'")
    expect(docker.match(/to_regclass/g)).toHaveLength(3)
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
    // Without LISTMONK_CAMPAIGNS_TOKEN, no hash: the issues' API user stays disabled (M11).
    expect(param(sqlText, 'campaigns_token_sha256')).toBe('')
    const withCampaigns = input({
      LISTMONK_API_TOKEN: 'the-token',
      LISTMONK_CAMPAIGNS_TOKEN: 'the-campaigns-token',
    })
    expect(withCampaigns).not.toContain('the-campaigns-token')
    expect(param(withCampaigns, 'campaigns_token_sha256')).toBe(
      createHash('sha256').update('the-campaigns-token').digest('hex'),
    )
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
    expect(keys).toHaveLength(12)
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
      // The issues' API user and sending rate (M11), as written.
      {
        LISTMONK_CAMPAIGNS_TOKEN: ' the-campaigns-token ',
        MAILBOX_LIMIT_HOUR: ' 500 ',
        MAILBOX_LIMIT_DAY: '2000',
        EMAIL_CAP_HOUR: '40',
        EMAIL_CAP_DAY: ' 150',
      },
      { MAILBOX_LIMIT_DAY: '1000', EMAIL_CAP_HOUR: 'x' },
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
  function prepare(
    env: Record<string, string> = {},
    dotenv = "LISTMONK_API_TOKEN='the-token'\n",
    /** The folder of an earlier run, as the next update finds it (its calls start afresh). */
    again?: string,
  ) {
    const dir = again ?? folder()
    if (again) writeFileSync(join(dir, 'docker.log'), '')
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
    return { ...run, calls, file, passwordFile, dir }
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
    const cases: { env: Record<string, string>; running: boolean; again: boolean }[] = [
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

  it('waits with a restart for changed settings while listmonk is sending an issue (M11)', () => {
    const env = { FAKE_INSTALLED: 't', FAKE_CHANGED: 'setting smtp', FAKE_LISTMONK_RUNNING: '1' }
    const waiting = prepare({ ...env, FAKE_SENDING: '1' })
    expect(waiting.status, waiting.output).toBe(0)
    expect(waiting.calls).not.toContain(RECREATE)
    expect(waiting.output).toContain('listmonk is sending an issue: its restart waits')
    // The next update, with nothing sending and nothing new to change, restarts it then.
    const later = prepare(
      { FAKE_INSTALLED: 't', FAKE_LISTMONK_RUNNING: '1' },
      undefined,
      waiting.dir,
    )
    expect(later.status, later.output).toBe(0)
    expect(later.calls.at(-1)).toBe(RECREATE)
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
      systemd = { INVOCATION_ID: '0123456789abcdef0123456789abcdef' },
    }: {
      env?: Record<string, string>
      backup?: Record<string, string>
      extra?: string
      systemd?: Record<string, string>
    } = {},
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
      ...systemd,
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
      journal: file('journalctl.args'),
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

  it('sends a test by hand with the lines of the unit’s last run, saying it is a test', () => {
    const last = 'fedcba9876543210fedcba9876543210'
    const byHand = alert('gliagora-backup', 'exit-code', {
      systemd: { FAKE_LAST_INVOCATION: last },
    })
    expect(byHand.status, byHand.output).toBe(0)
    expect(byHand.mail).toContain('Subject: [gliagora] backup failed (test, sent by hand)\n')
    expect(byHand.mail).toContain("(Sent by hand, as a test: the lines of the unit's last run.)")
    expect(byHand.mail).toContain('[2026-10-04T00:30:02Z] ERROR: pg_dump failed for gliagora')
    expect(byHand.mail).toContain('[2026-10-04T00:30:02Z] Note for [address]')
    expect(byHand.journal).toContain(`_SYSTEMD_INVOCATION_ID=${last}`)
    // A unit that never ran: the mail path is tested, with nothing to show.
    const never = alert('gliagora-restore-test', 'exit-code', { systemd: {} })
    expect(never.mail).toContain('Subject: [gliagora] restore test failed (test, sent by hand)\n')
    expect(never.mail).toContain('(Sent by hand: the unit has no run to show.)')
    expect(never.journal).toBeNull()
    // Run by systemd: its own run's lines, and no test mark.
    const run = alert('gliagora-backup', 'exit-code')
    expect(run.mail).toContain('Subject: [gliagora] backup failed\n')
    expect(run.journal).toContain('_SYSTEMD_INVOCATION_ID=0123456789abcdef0123456789abcdef')
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
      INVOCATION_ID: '0123456789abcdef0123456789abcdef',
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
    // The server check (monitor/check.sh): only when it has something to report.
    expect(decide('gliagora-monitor', 'success', 7)).toBe('no')
    expect(decide('gliagora-monitor', 'exit-code', 3)).toBe('yes')
  })

  it('emails what the server check found, and tells the check once the email has gone', () => {
    const state = folder()
    const at = 1_791_374_400
    writeFileSync(join(state, 'disk-root'), `${at - 900} 0 0\n`)
    writeFileSync(join(state, '.due'), 'disk-root\n')
    const run = { INVOCATION_ID: '0123456789abcdef0123456789abcdef', MONITOR_STATE_DIR: state }
    // The mail server refuses: the report stays due.
    const refused = alert('gliagora-monitor', 'exit-code', {
      systemd: { ...run, MONITOR_NOW: String(at), FAKE_CURL_EXIT: '1' },
    })
    expect(refused.status, refused.output).toBe(1)
    expect(readFileSync(join(state, 'disk-root'), 'utf8')).toBe(`${at - 900} 0 0\n`)
    expect(readdirSync(state).sort()).toEqual(['.due', 'disk-root'])
    // It goes out: the problem counts as reported from then on.
    const found = alert('gliagora-monitor', 'exit-code', {
      systemd: { ...run, MONITOR_NOW: String(at + 900) },
    })
    expect(found.status, found.output).toBe(0)
    expect(found.mail).toContain('Subject: [gliagora] server check found a problem\n')
    expect(found.mail).toContain('Unit: gliagora-monitor.service on ')
    expect(readFileSync(join(state, 'disk-root'), 'utf8')).toBe(`${at - 900} ${at + 900} 0\n`)
    expect(readdirSync(state)).toEqual(['disk-root'])
  })

  it('emails a failure of the server check itself once a day, and says nothing when it ends well', () => {
    const state = folder()
    const at = 1_791_374_400
    const broken = (now: number) =>
      alert('gliagora-monitor', 'exit-code', {
        systemd: {
          INVOCATION_ID: '0123456789abcdef0123456789abcdef',
          EXIT_STATUS: '2',
          MONITOR_STATE_DIR: state,
          MONITOR_NOW: String(now),
        },
      })
    const first = broken(at)
    expect(first.mail).toContain('Subject: [gliagora] server check failed\n')
    // Every 15 minutes while it lasts: no second email that day.
    const again = broken(at + 900)
    expect(again.status, again.output).toBe(0)
    expect(again.mail).toBeNull()
    expect(again.output).toContain(
      'no email: a failure of the server check was reported within the last day',
    )
    expect(broken(at + 86_400).mail).toContain('Subject: [gliagora] server check failed\n')
    // A run that ends well sends nothing and writes no line, 96 times a day.
    const well = alert('gliagora-monitor', 'success')
    expect(well.mail).toBeNull()
    expect(well.output).toBe('')
    // A test sent by hand is not a run of the check: nothing is noted.
    const byHand = alert('gliagora-monitor', 'exit-code', { systemd: { MONITOR_STATE_DIR: state } })
    expect(byHand.mail).toContain('server check found a problem (test, sent by hand)')
  })
})

describe('monitor/check.sh', () => {
  const SCRIPT = join(DEPLOY, 'monitor/check.sh')
  const MINUTE = 60
  const DAY = 86_400
  const NOW = Date.UTC(2026, 9, 7, 12, 0, 0) / 1000
  const iso = (seconds: number) => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z')
  /** A certificate of `lifetime` days with `left` of them to go at NOW, as the stand-in reads it. */
  const cert = (host: string, left: number, lifetime = 90) =>
    `${host}=${iso(NOW - (lifetime - left) * DAY)},${iso(NOW + left * DAY)}`
  const GOOD_CERTS = [cert('gliagora.test', 60), cert('www.gliagora.test', 60)].join(' ')

  type World = {
    /** `PATH=USE:FREE_KB:MOUNT:IUSE` entries for the df stand-in. */
    df?: string
    availableKb?: number
    /** "some avg300" of /proc/pressure/memory, or null where the kernel has no such file. */
    pressure?: string | null
    certs?: string
    env?: Record<string, string>
    args?: string[]
  }

  /**
   * A server of its own: .env, the memory files and the state folder. `run` checks it at a time;
   * `delivered` is what alert.sh says once the email about a run has gone out.
   */
  function server(dotEnv = "SITE_DOMAIN='gliagora.test'\n") {
    const dir = folder()
    writeFileSync(join(dir, '.env'), dotEnv)
    const state = join(dir, 'state')
    const settings = (at: number, df: string) => ({
      MONITOR_NOW: String(at),
      MONITOR_STATE_DIR: state,
      MONITOR_ENV_FILE: join(dir, '.env'),
      MONITOR_PATHS: df
        .split(' ')
        .map((entry) => entry.split('=')[0])
        .join(' '),
      MONITOR_MEMINFO: join(dir, 'meminfo'),
      MONITOR_PRESSURE: join(dir, 'pressure'),
      FAKE_LOG: dir,
    })
    const run = (at: number, world: World = {}) => {
      const {
        df = '/=41:20480000:/:5',
        availableKb = 2_400_000,
        pressure = '0.00',
        certs = GOOD_CERTS,
        env = {},
        args = [],
      } = world
      writeFileSync(
        join(dir, 'meminfo'),
        `MemTotal:        4000000 kB\nMemFree:          100000 kB\nMemAvailable:    ${availableKb} kB\n`,
      )
      if (pressure === null) rmSync(join(dir, 'pressure'), { force: true })
      else {
        writeFileSync(
          join(dir, 'pressure'),
          `some avg10=0.00 avg60=0.00 avg300=${pressure} total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`,
        )
      }
      return runScript(SCRIPT, args, {
        ...settings(at, df),
        FAKE_DF: df,
        FAKE_CERTS: certs,
        ...env,
      })
    }
    const delivered = (at: number, status = '1') =>
      runScript(SCRIPT, ['--delivered', status], settings(at, '/=41:20480000:/:5'))
    const failureReported = (at: number) =>
      runScript(SCRIPT, ['--failure-reported'], settings(at, '/=41:20480000:/:5')).status === 0
    /** The problems it remembers (its own notes, `.due` and `.failed`, apart). */
    const remembered = () => {
      try {
        return readdirSync(state)
          .filter((name) => !name.startsWith('.'))
          .sort()
      } catch {
        return []
      }
    }
    const note = (name: string) => {
      try {
        return readFileSync(join(state, name), 'utf8')
      } catch {
        return null
      }
    }
    return { dir, state, run, delivered, failureReported, remembered, note }
  }

  /** What the second run in a row says about a world: the first sighting is never a report. */
  const second = (world: World, dotEnv?: string) => {
    const { run } = server(dotEnv)
    run(NOW, world)
    return run(NOW + 15 * MINUTE, world)
  }

  it('says one line and ends well when all is well', () => {
    const { dir, run, remembered } = server()
    const { status, output } = run(NOW)
    expect(status, output).toBe(0)
    expect(output).toMatch(
      /^\[\d{4}-\d\d-\d\dT[\d:]{8}Z\] ok: disk \/ 41%, memory 60% available, certificate gliagora\.test 60 days, certificate www\.gliagora\.test 60 days\n$/,
    )
    expect(remembered()).toEqual([])
    // Caddy is asked on this computer, by the site's names.
    expect(readFileSync(join(dir, 'openssl.args'), 'utf8')).toBe(
      's_client -connect 127.0.0.1:443 -servername gliagora.test\n' +
        's_client -connect 127.0.0.1:443 -servername www.gliagora.test\n',
    )
  })

  it('reports a problem once a second run sees it, then once a day, never every few minutes', () => {
    const { run, delivered, remembered, note } = server()
    const full = { df: '/=91:3072000:/:5' }
    const first = run(NOW, full)
    expect(first.status, first.output).toBe(0)
    expect(first.output).toContain('seen once: disk: / is 91% full (limit 85%), 3000 MB free')
    expect(first.output).toContain('the rest is fine: memory 60% available')
    expect(remembered()).toEqual(['disk-root'])

    const report = run(NOW + 15 * MINUTE, full)
    expect(report.status, report.output).toBe(1)
    expect(report.output).toContain('PROBLEM: disk: / is 91% full (limit 85%), 3000 MB free')
    expect(report.output).toContain('goes out once, then once a day while it lasts')
    expect(note('.due')).toBe('disk-root\n')
    // alert.sh sent the email, and says so.
    expect(delivered(NOW + 15 * MINUTE).status).toBe(0)
    expect(note('.due')).toBeNull()

    // The next runs of the day say that it lasts, without failing (no email).
    for (const later of [30 * MINUTE, 6 * 60 * MINUTE, 15 * MINUTE + DAY - 1]) {
      const quiet = run(NOW + later, full)
      expect(quiet.status, quiet.output).toBe(0)
      expect(quiet.output).toContain('reported at 2026-10-07T12:15:00Z')
      expect(quiet.output).not.toContain('PROBLEM')
    }
    const reminder = run(NOW + 15 * MINUTE + DAY, full)
    expect(reminder.status, reminder.output).toBe(1)
    expect(reminder.output).toContain(
      'STILL A PROBLEM since 2026-10-07T12:00:00Z: disk: / is 91% full',
    )
    delivered(NOW + 15 * MINUTE + DAY)
    expect(run(NOW + 30 * MINUTE + DAY, full).status).toBe(0)

    // Over only after four runs in a row without it; the journal says so, and nothing fails.
    for (const clear of [1, 2, 3]) {
      const waiting = run(NOW + 2 * DAY + clear * 15 * MINUTE)
      expect(waiting.status, waiting.output).toBe(0)
      expect(waiting.output).toContain('not seen in this run: disk-root')
      expect(remembered()).toEqual(['disk-root'])
    }
    const over = run(NOW + 2 * DAY + 60 * MINUTE)
    expect(over.status, over.output).toBe(0)
    expect(over.output).toContain('over: disk-root')
    expect(over.output).toContain('ok: disk / 41%')
    expect(remembered()).toEqual([])
    // A new problem starts from the beginning.
    expect(run(NOW + 3 * DAY, full).output).toContain('seen once: disk')
  })

  it('keeps a report due until its email has gone: no mail server yet, or one that refuses', () => {
    const { run, delivered } = server()
    const full = { df: '/=91:3072000:/:5' }
    run(NOW, full)
    // Nobody says "delivered": every run fails again with the problem, so the next email carries it.
    for (const later of [15, 30, 45]) {
      const again = run(NOW + later * MINUTE, full)
      expect(again.status, again.output).toBe(1)
      expect(again.output).toContain('PROBLEM: disk: / is 91% full')
    }
    delivered(NOW + 45 * MINUTE)
    const after = run(NOW + 60 * MINUTE, full)
    expect(after.status, after.output).toBe(0)
    expect(after.output).toContain('reported at 2026-10-07T12:45:00Z')
  })

  it('treats a problem that comes and goes as one problem, reported once a day', () => {
    const { run, delivered, remembered } = server()
    const low = { availableKb: 200_000 }
    // Every other run: the second sighting within the hour is the report.
    expect(run(NOW, low).status).toBe(0)
    expect(run(NOW + 15 * MINUTE).output).toContain('not seen in this run: memory')
    const report = run(NOW + 30 * MINUTE, low)
    expect(report.status, report.output).toBe(1)
    delivered(NOW + 30 * MINUTE)
    // Two runs with it, one without, for the rest of the day: no second email.
    for (let step = 3; step < 3 + 4 * 23; step++) {
      const world = step % 3 === 2 ? {} : low
      const { status, output } = run(NOW + step * 15 * MINUTE, world)
      expect(status, `run ${step}: ${output}`).toBe(0)
    }
    expect(remembered()).toEqual(['memory'])
    // A day of runs, each a bash process: more time than a test's usual five seconds (CI's
    // runners took six).
  }, 60_000)

  it('does not report what a single run saw (a backup, a restart)', () => {
    const { run, remembered } = server()
    expect(run(NOW, { availableKb: 200_000, certs: '' }).status).toBe(0)
    expect(remembered()).toEqual([
      'certificate-gliagora.test',
      'certificate-www.gliagora.test',
      'memory',
    ])
    for (const clear of [1, 2, 3, 4]) {
      const after = run(NOW + clear * 15 * MINUTE)
      expect(after.status, after.output).toBe(0)
    }
    expect(remembered()).toEqual([])
  })

  it('checks each file system once, by space and by inodes, and skips what is not there', () => {
    const { status, output } = second({
      // Two folders of one file system, one of its own that is full of small files, and one
      // whose file system counts no inodes.
      df: '/=41:20480000:/:5 /var/lib/docker=41:20480000:/:5 /var/backups/gliagora=50:900000:/var/backups:97 /opt/gliagora=85:512000:/opt/gliagora:-',
      env: {
        MONITOR_PATHS: '/ /var/lib/docker /var/backups/gliagora /opt/gliagora /no/such/folder',
      },
    })
    expect(status, output).toBe(1)
    expect(output.match(/disk \/ 41%/g)).toHaveLength(1)
    expect(output).toContain(
      'PROBLEM: disk: /var/backups has used 97% of its file entries (inodes; limit 85%)',
    )
    expect(output).toContain('PROBLEM: disk: /opt/gliagora is 85% full (limit 85%), 500 MB free')
    expect(output).not.toContain('/no/such/folder')
  })

  it('reports little available memory, and waiting for memory where the kernel says', () => {
    const low = second({ availableKb: 360_000 })
    expect(low.status, low.output).toBe(1)
    expect(low.output).toContain(
      'PROBLEM: memory: 9% of the memory is available (351 of 3906 MB; limit 10%)',
    )
    expect(second({ availableKb: 400_000 }).status).toBe(0)
    const waiting = second({ pressure: '12.50' })
    expect(waiting.status, waiting.output).toBe(1)
    expect(waiting.output).toContain(
      'PROBLEM: memory: programs waited for memory during 12% of the last five minutes (limit 10%)',
    )
    expect(second({ pressure: '9.99' }).status).toBe(0)
    const both = second({ availableKb: 100_000, pressure: '40.00' })
    expect(both.output).toMatch(
      /PROBLEM: memory: 2% of the memory is available .*; programs waited/,
    )
    // A kernel without pressure figures: the available memory alone.
    const without = second({ pressure: null })
    expect(without.status, without.output).toBe(0)
    expect(without.output).toContain('memory 60% available')
    // A memory file that cannot be read is a problem to report, not a crash.
    const unread = second({ env: { MONITOR_MEMINFO: '/no/such/file' } })
    expect(unread.status, unread.output).toBe(1)
    expect(unread.output).toContain('PROBLEM: memory: /no/such/file could not be read')
  })

  it('reports a certificate with less than a sixth of its lifetime left, for the site and www.', () => {
    const report = (certs: string) => second({ certs })
    const other = cert('www.gliagora.test', 60)
    // 90 days: Caddy renews 30 days before the end; 15 days is the limit.
    expect(report(`${cert('gliagora.test', 16)} ${other}`).status).toBe(0)
    const late = report(`${cert('gliagora.test', 14)} ${other}`)
    expect(late.status, late.output).toBe(1)
    expect(late.output).toContain(
      'PROBLEM: certificate: the certificate for gliagora.test ends in 13 days, on 2026-10-21, and Caddy has not renewed it',
    )
    expect(late.output).toContain('the rest is fine')
    expect(late.output).toContain('certificate www.gliagora.test 59 days')
    // The limit follows the lifetime: 7.5 days of a 45-day certificate.
    expect(report(`${cert('gliagora.test', 9, 45)} ${other}`).status).toBe(0)
    expect(report(`${cert('gliagora.test', 7, 45)} ${other}`).status).toBe(1)
    const www = report(`${cert('gliagora.test', 60)} ${cert('www.gliagora.test', 3)}`)
    expect(www.output).toContain(
      'PROBLEM: certificate: the certificate for www.gliagora.test ends in 2 days',
    )
    const ended = report(`${cert('gliagora.test', -1)} ${other}`)
    expect(ended.output).toContain(
      'PROBLEM: certificate: the certificate for gliagora.test ended on 2026-10-06: browsers refuse the site',
    )
    // Caddy does not answer, or has no certificate for the name.
    const down = report(other)
    expect(down.status, down.output).toBe(1)
    expect(down.output).toContain(
      'PROBLEM: certificate: the certificate for gliagora.test could not be read from Caddy (127.0.0.1:443): is the site up?',
    )
  })

  it('reads SITE_DOMAIN as alert.sh reads .env, and never prints a line it cannot use', () => {
    const quoted = server('OTHER=1\nSITE_DOMAIN="gliagora.test"\n')
    expect(quoted.run(NOW).output).toContain('certificate gliagora.test 60 days')
    for (const dotEnv of ['SITE_DOMAIN=glia$gora.test\n', 'OTHER=1\n']) {
      const { status, output } = second({}, dotEnv)
      expect(status, output).toBe(1)
      expect(output).toContain('PROBLEM: certificate: SITE_DOMAIN could not be read from ')
    }
    // Two settings on one line: Compose and env_value read them as one value; it is not shown.
    const joined = second({}, 'SITE_DOMAIN=gliagora.test SMTP_PASS=not-a-real-secret\n')
    expect(joined.status, joined.output).toBe(1)
    expect(joined.output).toContain('PROBLEM: certificate: SITE_DOMAIN in ')
    expect(joined.output).toContain(' is no host name')
    expect(joined.output).not.toContain('not-a-real-secret')
    expect(joined.output).not.toContain('SMTP_PASS')
  })

  it('shows what it would say with --dry-run, without changing what it remembers', () => {
    const { run, delivered, remembered, note } = server()
    const full = { df: '/=91:3072000:/:5' }
    const dry = run(NOW, { ...full, args: ['--dry-run'] })
    expect(dry.status, dry.output).toBe(0)
    expect(dry.output).toContain('seen once: disk: / is 91% full')
    expect(remembered()).toEqual([])
    run(NOW, full)
    // A dry run that has a report says so and ends like the run would, noting nothing.
    const due = run(NOW + 15 * MINUTE, { ...full, args: ['--dry-run'] })
    expect(due.status, due.output).toBe(1)
    expect(note('.due')).toBeNull()
    expect(note('disk-root')).toBe(`${NOW} 0 0\n`)
    run(NOW + 15 * MINUTE, full)
    delivered(NOW + 15 * MINUTE)
    // All well again: a dry run counts no clear run.
    expect(run(NOW + 30 * MINUTE, { args: ['--dry-run'] }).output).toContain(
      'not seen in this run: disk-root',
    )
    expect(note('disk-root')).toBe(`${NOW} ${NOW + 15 * MINUTE} 0\n`)
  })

  it('ends with 2 and a line when the check itself fails, so the email says "failed"', () => {
    const { run, state } = server()
    // A state folder that cannot be made, or written: no silent "seen once" for ever.
    const unmade = run(NOW, { env: { MONITOR_STATE_DIR: '/proc/no-such-folder/state' } })
    expect(unmade.status, unmade.output).toBe(2)
    expect(unmade.output).toContain('ERROR: cannot make /proc/no-such-folder/state')
    run(NOW)
    chmodSync(state, 0o500)
    try {
      const unwritable = run(NOW + 15 * MINUTE, { df: '/=99:1024:/:5' })
      expect(unwritable.status, unwritable.output).toBe(2)
      expect(unwritable.output).toContain(`ERROR: cannot write ${state}/disk-root`)
    } finally {
      chmodSync(state, 0o700)
    }
    // A limit that is no whole number would switch its check off: refused, by name.
    for (const [name, value] of [
      ['DISK_MAX_PERCENT', '90%'],
      ['MEMORY_MIN_PERCENT', 'ten'],
      ['CERT_MIN_LIFETIME_PARTS', '0'],
    ] as const) {
      const mistyped = run(NOW, {
        df: '/=99:1024:/:5',
        availableKb: 40_000,
        env: { [name]: value },
      })
      expect(mistyped.status, mistyped.output).toBe(2)
      expect(mistyped.output).toContain(`${name} must be a whole number above 0`)
      expect(mistyped.output).not.toContain('ok:')
    }
    const usage = runScript(SCRIPT, ['--unknown'], {})
    expect(usage.status).toBe(2)
  })

  it('remembers a failure of its own for a day, for alert.sh, until it runs well again', () => {
    const { run, delivered, failureReported } = server()
    expect(failureReported(NOW)).toBe(false)
    delivered(NOW, '2')
    expect(failureReported(NOW + 15 * MINUTE)).toBe(true)
    expect(failureReported(NOW + DAY - 1)).toBe(true)
    expect(failureReported(NOW + DAY)).toBe(false)
    // A time ahead of now (the clock was set back) is no reason to stay silent.
    expect(failureReported(NOW - 60)).toBe(false)
    // The check runs again: the next failure is news.
    delivered(NOW + DAY, '2')
    run(NOW + DAY + 15 * MINUTE)
    expect(failureReported(NOW + DAY + 30 * MINUTE)).toBe(false)
  })

  it('runs every 15 minutes, keeps what it reported in memory and emails through alert.sh', () => {
    const service = read('deploy/monitor/systemd/gliagora-monitor.service')
    expect(service).toMatch(/^ExecStart=\/opt\/gliagora\/monitor\/check\.sh$/m)
    // Under /run, kept between the runs: a full disk cannot keep it from writing.
    expect(service).toMatch(/^RuntimeDirectory=gliagora-monitor$/m)
    expect(service).toMatch(/^RuntimeDirectoryPreserve=yes$/m)
    expect(service).not.toMatch(/^StateDirectory=/m)
    expect(service).toMatch(/^TimeoutStartSec=\d+$/m)
    expect(service).toMatch(/^ExecStopPost=-\/opt\/gliagora\/backup\/alert\.sh %N$/m)
    expect(read('deploy/monitor/systemd/gliagora-monitor.timer')).toMatch(/^OnCalendar=\*:07\/15$/m)
    // The unit's name is the one alert.sh knows.
    expect(sourced('deploy/backup/alert.sh', 'unit_label gliagora-monitor').trim()).toBe(
      'server check',
    )
  })
})

describe('logs/install-journald.sh', () => {
  const SCRIPT = join(DEPLOY, 'logs/install-journald.sh')
  const NAME = 'zz-gliagora.conf'

  /** Runs the installer on a folder of its own, beside the stand-in for Ubuntu's syslog.conf. */
  function install(dir: string, env: Record<string, string> = {}) {
    const run = runScript(SCRIPT, [], { JOURNALD_DROPIN_DIR: dir, FAKE_LOG: dir, ...env })
    let restarts = ''
    try {
      restarts = readFileSync(join(dir, 'systemctl.args'), 'utf8')
    } catch {
      // No call of systemctl.
    }
    return { ...run, restarts }
  }

  it('is read after Ubuntu’s own drop-in, whose ForwardToSyslog=yes would otherwise win', () => {
    // journald reads the drop-ins of /usr/lib and /etc in the order of their names; the last wins.
    // The file's first name, 90-gliagora.conf, sorted before syslog.conf (found on the server).
    const names = ['90-gliagora.conf', 'syslog.conf', NAME].sort()
    expect(names.at(-1)).toBe(NAME)
    expect(filesUnder('deploy/logs')).toEqual([
      'deploy/logs/install-journald.sh',
      `deploy/logs/${NAME}`,
    ])
  })

  it('installs the file, removes its first name and leaves its settings in force', () => {
    const dir = folder()
    writeFileSync(join(dir, '90-gliagora.conf'), '[Journal]\nForwardToSyslog=no\n')
    const run = install(dir)
    expect(run.output).toContain('the journal keeps 14 days')
    expect(run.status).toBe(0)
    expect(readdirSync(dir).filter((name) => name.endsWith('.conf'))).toEqual([NAME])
    expect(readFileSync(join(dir, NAME), 'utf8')).toBe(read(`deploy/logs/${NAME}`))
    expect(run.restarts).toBe('restart systemd-journald\n')

    // Again: nothing to do, and journald is not restarted.
    const again = install(dir)
    expect(again.status).toBe(0)
    expect(again.output).toContain('already in place')
    expect(again.restarts).toBe('restart systemd-journald\n')
  })

  it('fails, naming the setting, when a later file still overrides one', () => {
    const dir = folder()
    writeFileSync(join(dir, 'zzz-other.conf'), '[Journal]\nForwardToSyslog=yes\n')
    const run = install(dir)
    expect(run.status).not.toBe(0)
    expect(run.output).toContain('ERROR: ForwardToSyslog=no is not in force')
    expect(run.output).not.toContain('MaxRetentionSec')
    // Also on a later run, when the file itself is in place.
    const again = install(dir)
    expect(again.status).not.toBe(0)
    expect(again.output).toContain('ERROR: ForwardToSyslog=no is not in force')
    expect(again.output).not.toContain('already in place')
  })

  it('still refuses to run without root on the server', () => {
    if (process.getuid?.() === 0) return // CI's containers may run as root
    const run = runScript(SCRIPT, [], { FAKE_LOG: folder() })
    expect(run.status).toBe(1)
    expect(run.output).toContain('run as root')
  })
})
