// Prepares a listmonk database for local development and the tests (M2, D50):
//   LISTMONK_DATABASE_URL=… LISTMONK_API_TOKEN=… pnpm listmonk:setup
// The production server never runs this: deploy/listmonk/prepare.sh does the same there, with psql.
//
// LISTMONK_DATABASE_URL names listmonk's database, with a user that owns it or is a superuser (the
// local PostgreSQL's from .env, e.g. postgres://gliagora:…@localhost:5432/listmonk). It:
//   1. creates that database if it is missing (when the user may);
//   2. with LISTMONK_BIN (a listmonk program, for a computer without Docker), installs listmonk in
//      it with its admin account gliagora-admin (LISTMONK_ADMIN_PASSWORD; idempotent: a database
//      that has it already is left alone) and brings its schema up to date; otherwise the caller
//      installed it (compose.yaml's listmonk installs itself when it starts, with the same admin:
//      `docker compose --profile newsletter up -d listmonk`);
//   3. applies deploy/listmonk/settings.sql: the list Glia Notes, the app's API user, whose token is
//      LISTMONK_API_TOKEN (give the app the same value), and the settings, with the SMTP_* settings
//      of this environment (Mailpit locally) and LISTMONK_ROOT_URL (default http://localhost:9000).
// listmonk reads its settings only when it starts: restart it when this says something changed.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sql } from '@payloadcms/db-postgres'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'

import { applyListmonkSettings, listmonkParams } from './listmonk-settings'

/** Runs listmonk with its output shown here (it prints no secret: no API user is asked for). */
function listmonk(program: string, args: string[], env: Record<string, string>, cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(program, args, {
      env: { NODE_ENV: 'development', ...env },
      cwd,
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`listmonk ${args[0]} exited with ${code}`)),
    )
  })
}

// PAYLOAD_JOBS_AUTORUN is "true" only on the production server (deploy/compose.prod.yml).
if (process.env.PAYLOAD_JOBS_AUTORUN === 'true') {
  console.error(
    'pnpm listmonk:setup is for local development and the tests only; on the server, deploy/listmonk/prepare.sh does this. It does not run where PAYLOAD_JOBS_AUTORUN is "true", which marks the production server.',
  )
  process.exit(1)
}

const target = process.env.LISTMONK_DATABASE_URL?.trim()
if (!target || !process.env.LISTMONK_API_TOKEN?.trim()) {
  console.error(
    'Set LISTMONK_DATABASE_URL (listmonk’s database, with its owner or a superuser) and LISTMONK_API_TOKEN (the app’s API token, any long random text; give the app the same).',
  )
  process.exit(1)
}

const url = new URL(target)
const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(database)) {
  console.error('LISTMONK_DATABASE_URL must name a database (lowercase letters, digits and _).')
  process.exit(1)
}

try {
  // 1. The database. Identifiers cannot be parameters; the name was checked above.
  const server = new URL(target)
  server.pathname = '/postgres'
  const admin = drizzle(server.toString())
  try {
    const { rows } = await admin.execute(sql`select 1 from pg_database where datname = ${database}`)
    if (rows.length === 0) {
      await admin.execute(sql.raw(`CREATE DATABASE "${database}"`))
      console.log(`Created the database ${database}.`)
    }
  } finally {
    await admin.$client.end()
  }

  // 2. listmonk itself, when its program is given: with its admin account, which a new install
  // needs (settings.sql refuses a listmonk without one: the app's role would become role 1, the
  // super admin).
  const program = process.env.LISTMONK_BIN?.trim()
  if (program) {
    const db = drizzle(target)
    const installed = await db
      .execute<{ installed: boolean }>(
        sql`select to_regclass('public.settings') is not null as installed`,
      )
      .then(({ rows }) => rows[0]?.installed === true)
      .finally(() => db.$client.end())
    if (!installed && (process.env.LISTMONK_ADMIN_PASSWORD ?? '').length < 8) {
      console.error(
        'Set LISTMONK_ADMIN_PASSWORD (at least 8 characters): listmonk is installed with its admin account, gliagora-admin.',
      )
      process.exit(1)
    }
    const env = {
      PATH: process.env.PATH ?? '',
      TZ: 'Etc/UTC',
      // Only printed by the install (which stops without it); nothing listens here.
      LISTMONK_app__address: '127.0.0.1:9000',
      LISTMONK_db__host: url.hostname,
      LISTMONK_db__port: url.port || '5432',
      LISTMONK_db__user: decodeURIComponent(url.username),
      LISTMONK_db__password: decodeURIComponent(url.password),
      LISTMONK_db__database: database,
      LISTMONK_db__ssl_mode: 'disable',
      // The admin, made by the first install only.
      LISTMONK_ADMIN_USER: 'gliagora-admin',
      LISTMONK_ADMIN_PASSWORD: process.env.LISTMONK_ADMIN_PASSWORD ?? '',
    }
    // In a folder of its own: listmonk reads nothing from it with `--config ''`.
    const cwd = mkdtempSync(join(tmpdir(), 'listmonk-setup-'))
    try {
      await listmonk(program, ['--install', '--idempotent', '--yes', '--config', ''], env, cwd)
      await listmonk(program, ['--upgrade', '--yes', '--config', ''], env, cwd)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
    console.log('listmonk is installed and its schema is up to date.')
  }

  // 3. The settings.
  const changed = await applyListmonkSettings(target, listmonkParams())
  console.log(
    changed.length
      ? `listmonk settings changed (${changed.join('; ')}): restart listmonk so that it reads them.`
      : 'listmonk settings: nothing to change.',
  )
} catch (error) {
  // The class and the database code only: a message can quote a value.
  const code = (error as { code?: unknown }).code
  console.error(
    'pnpm listmonk:setup failed:',
    error instanceof Error ? error.name : typeof error,
    typeof code === 'string' ? code : '',
    // settings.sql's own checks say which parameter or setting is wrong, never a value.
    error instanceof Error &&
      /^(listmonk |api_token|root_url|smtp_|more than one)/.test(error.message)
      ? error.message
      : '',
  )
  process.exit(1)
}
