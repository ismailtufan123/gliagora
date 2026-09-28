import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv, promisify } from 'node:util'

import { sql } from '@payloadcms/db-postgres'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'
import type { TestProject } from 'vitest/node'

const run = promisify(execFile)

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

/**
 * Creates a scratch database on the PostgreSQL server of TEST_DATABASE_URL (or DATABASE_URL),
 * applies the migrations to it with the Payload CLI, and drops it when the tests end. The server's
 * own database is never touched.
 */
export default async function setup(project: TestProject) {
  const local = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}
  const server =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    local.TEST_DATABASE_URL ??
    local.DATABASE_URL
  if (!server) {
    throw new Error(
      'pnpm test:db needs a PostgreSQL server: set TEST_DATABASE_URL, or DATABASE_URL in .env.',
    )
  }
  const name = `gliagora_test_${randomBytes(4).toString('hex')}`
  const admin = drizzle(server)
  await admin.execute(sql.raw(`CREATE DATABASE "${name}"`))
  const url = new URL(server)
  url.pathname = `/${name}`
  const databaseUrl = url.toString()
  try {
    await run('pnpm', ['exec', 'payload', 'migrate'], {
      env: { ...process.env, DATABASE_URL: databaseUrl, PAYLOAD_JOBS_AUTORUN: 'false' },
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch (error) {
    await admin.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`))
    await admin.$client.end()
    throw error
  }
  project.provide('databaseUrl', databaseUrl)
  return async () => {
    await admin.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`))
    await admin.$client.end()
  }
}
