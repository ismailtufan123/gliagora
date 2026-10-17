import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { sql } from '@payloadcms/db-postgres'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'

import type { ListmonkClient } from '@/lib/newsletter/listmonk'
import {
  LISTMONK_API_USER,
  type ListmonkParams,
  applyListmonkSettings,
  listmonkParams,
} from '@/scripts/listmonk-settings'

import { dockerAvailable, freePort } from './mailpit'

const run = promisify(execFile)

// A throwaway listmonk for the tests (M2, D50), shaped like startMailpit(): a scratch database and
// role of its own on the PostgreSQL of TEST_DATABASE_URL, listmonk installed in it, the server's
// settings applied (deploy/listmonk/settings.sql, through src/scripts/listmonk-settings.ts) and
// listmonk started on a free port of this computer. The same image as compose.yaml and the server,
// on the host's network (CI's PostgreSQL listens on its loopback), with the server's hardening; or,
// where Docker is not available, the listmonk program named by LISTMONK_BIN. `stop()` ends it and
// drops the database and the role. Fake addresses only.

/** The image pinned in compose.yaml (and deploy/compose.prod.yml: a unit test checks they agree). */
export const LISTMONK_IMAGE = (() => {
  const match = /image:\s*(listmonk\/listmonk\S+)/.exec(readFileSync('compose.yaml', 'utf8'))
  if (!match?.[1]) throw new Error('compose.yaml has no listmonk image')
  return match[1]
})()

/** The listmonk program named by LISTMONK_BIN, if it exists. */
export function listmonkBinary(): string | null {
  const file = process.env.LISTMONK_BIN?.trim()
  return file && existsSync(file) ? file : null
}

/** Whether the tests can start a listmonk: with Docker, or with LISTMONK_BIN. */
export async function listmonkAvailable(): Promise<boolean> {
  return (await dockerAvailable()) || listmonkBinary() !== null
}

export type ListmonkOptions = {
  /** settings.sql's SMTP parameters, as the app's SMTP_* settings (default: none). */
  smtp?: Record<string, string>
  /** Installs it without an admin account, which settings.sql refuses (a test of that). */
  withoutAdmin?: boolean
}

export async function startListmonk({ smtp = {}, withoutAdmin = false }: ListmonkOptions = {}) {
  const server = process.env.TEST_DATABASE_URL
  if (!server) throw new Error('startListmonk needs TEST_DATABASE_URL (pnpm test:db sets it)')
  const name = `listmonk_test_${randomBytes(4).toString('hex')}`
  const password = randomBytes(16).toString('hex')
  const admin = drizzle(server)
  // Identifiers cannot be parameters; these are made here from hex digits.
  await admin.execute(
    sql.raw(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`),
  )
  await admin.execute(sql.raw(`CREATE DATABASE ${name} OWNER ${name}`))
  const target = new URL(server)
  target.username = name
  target.password = password
  target.pathname = `/${name}`
  const databaseUrl = target.toString()
  /** The same database as the PostgreSQL superuser, as the server's prepare.sh connects. */
  const superuserUrl = Object.assign(new URL(server), { pathname: `/${name}` }).toString()

  const port = await freePort()
  const token = randomBytes(32).toString('hex')
  // The issues' API user (M11): a token of its own.
  const campaignsToken = randomBytes(32).toString('hex')
  const url = `http://127.0.0.1:${port}`
  const env: Record<string, string> = {
    TZ: 'Etc/UTC',
    LISTMONK_app__address: `127.0.0.1:${port}`,
    LISTMONK_db__host: target.hostname,
    LISTMONK_db__port: target.port || '5432',
    LISTMONK_db__user: name,
    LISTMONK_db__password: password,
    LISTMONK_db__database: name,
    LISTMONK_db__ssl_mode: 'disable',
  }
  const container = `gliagora-test-listmonk-${randomBytes(4).toString('hex')}`
  const docker = await dockerAvailable()
  const program = docker ? null : listmonkBinary()
  if (!docker && !program)
    throw new Error('Neither Docker nor LISTMONK_BIN is available for listmonk')
  // listmonk writes nothing with `--config ''`; a folder of its own all the same.
  const cwd = mkdtempSync(join(tmpdir(), 'listmonk-'))
  let child: ChildProcess | null = null

  /** Runs listmonk once with these arguments (the server's hardening in a container). */
  const once = async (args: string[], extra: Record<string, string> = {}) => {
    const all = { ...env, ...extra }
    if (docker) {
      await run(
        'docker',
        [
          'run',
          '--rm',
          '--network',
          'host',
          '--security-opt',
          'no-new-privileges:true',
          '--cap-drop',
          'ALL',
          // Names only: Docker takes the values from this process's environment.
          ...Object.keys(all).flatMap((key) => ['--env', key]),
          LISTMONK_IMAGE,
          './listmonk',
          ...args,
        ],
        { env: { ...process.env, ...all } },
      )
    } else {
      await run(program!, args, { env: { NODE_ENV: 'test', PATH: process.env.PATH, ...all }, cwd })
    }
  }

  const params = (overrides: Partial<ListmonkParams> = {}): ListmonkParams => ({
    ...listmonkParams({
      LISTMONK_API_TOKEN: token,
      LISTMONK_CAMPAIGNS_TOKEN: campaignsToken,
      LISTMONK_ROOT_URL: url,
      ...smtp,
    }),
    ...overrides,
  })

  let stopped = false
  const listmonk = {
    url,
    token,
    databaseUrl,
    superuserUrl,
    /** The headers of a call as the app's API user (never a Cookie: listmonk would ignore these). */
    headers: { Authorization: `token ${LISTMONK_API_USER}:${token}` },
    /** The token of the issues' API user (M11, `gliagora-campaigns`). */
    campaignsToken,
    /** The headers of a call as the issues' API user. */
    campaignsHeaders: { Authorization: `token gliagora-campaigns:${campaignsToken}` },
    /** settings.sql's parameters for this listmonk, as `pnpm listmonk:setup` gives them. */
    params,
    /** Applies settings.sql again, as its owner; returns what changed. */
    applySettings: (overrides: Partial<ListmonkParams> = {}) =>
      applyListmonkSettings(databaseUrl, params(overrides)),
    /** listmonk's stored settings of these keys, by key (read from its database). */
    async settings(keys: string[]): Promise<Record<string, unknown>> {
      const db = drizzle(databaseUrl)
      try {
        const { rows } = await db.execute<{ key: string; value: unknown }>(
          sql`select key, value from settings where key in ${keys}`,
        )
        return Object.fromEntries(rows.map((row) => [row.key, row.value]))
      } finally {
        await db.$client.end()
      }
    },
    async stop() {
      if (stopped) return
      stopped = true
      if (child) {
        const running = child
        if (running.exitCode === null && running.signalCode === null) {
          await new Promise<void>((resolve) => {
            running.once('exit', () => resolve())
            running.kill('SIGTERM')
          })
        }
      } else {
        await run('docker', ['stop', container]).catch(() => {})
      }
      rmSync(cwd, { recursive: true, force: true })
      await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`))
      await admin.execute(sql.raw(`DROP ROLE IF EXISTS ${name}`))
      await admin.$client.end()
    },
  }

  try {
    // With its admin, as deploy/listmonk/prepare.sh installs it (the account's password is
    // thrown away: the tests use the API user only).
    await once(
      ['--install', '--idempotent', '--yes', '--config', ''],
      withoutAdmin
        ? {}
        : {
            LISTMONK_ADMIN_USER: 'gliagora-admin',
            LISTMONK_ADMIN_PASSWORD: randomBytes(16).toString('hex'),
          },
    )
    await once(['--upgrade', '--yes', '--config', ''])
    await listmonk.applySettings()
    if (docker) {
      await run(
        'docker',
        [
          'run',
          '--detach',
          '--rm',
          '--name',
          container,
          '--network',
          'host',
          '--security-opt',
          'no-new-privileges:true',
          '--cap-drop',
          'ALL',
          ...Object.keys(env).flatMap((key) => ['--env', key]),
          LISTMONK_IMAGE,
          './listmonk',
          '--config',
          '',
        ],
        { env: { ...process.env, ...env } },
      )
    } else {
      child = spawn(program!, ['--config', ''], {
        env: { NODE_ENV: 'test', PATH: process.env.PATH, ...env },
        cwd,
        stdio: 'ignore',
      })
      child.unref()
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if ((await fetch(`${url}/health`)).ok) return listmonk
      } catch {
        // Not listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error('listmonk did not start')
  } catch (error) {
    await listmonk.stop()
    throw error
  }
}

export type Listmonk = Awaited<ReturnType<typeof startListmonk>>

/**
 * A listmonk client with no subscribers, for the tests of deletions that need the newsletter
 * configured but have nothing in it: an erasure refuses while listmonk is not configured once the
 * newsletter has records (src/lib/newsletter/erase.ts), and the scratch database is shared with the
 * newsletter's own tests. It never subscribes anyone.
 */
export const noSubscribers: ListmonkClient = {
  listId: async () => 1,
  findByEmail: async () => null,
  findById: async () => null,
  listPage: async () => ({ subscribers: [], total: 0 }),
  subscribe: async () => {
    throw new Error('noSubscribers subscribes nobody')
  },
  changeEmail: async () => {
    throw new Error('noSubscribers has nobody to move')
  },
  remove: async () => {},
}
