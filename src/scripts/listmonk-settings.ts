import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'

import { smtpSettings } from '@/lib/email/settings'
import { DEFAULT_LISTMONK_API_USER } from '@/lib/newsletter/config'

// Applies deploy/listmonk/settings.sql to a listmonk database (M2, D50): the same file the server
// applies with psql (deploy/listmonk/prepare.sh), here through node-postgres for local development
// (`pnpm listmonk:setup`), the tests (tests/integration/listmonk.ts) and CI. The parameters go in as
// values of a temporary table, never as text of the SQL, so the SMTP password cannot appear in a
// statement PostgreSQL might log; the API token itself never reaches the database, only its
// SHA-256, which is how listmonk 6.2 stores API tokens.

type Env = Record<string, string | undefined>

/** The file, read when it is applied (the Docker image of the app does not hold deploy/). */
export const SETTINGS_SQL = join(process.cwd(), 'deploy/listmonk/settings.sql')

/** The app's API user in listmonk (settings.sql makes it; the app's default LISTMONK_API_USER). */
export const LISTMONK_API_USER = DEFAULT_LISTMONK_API_USER

/** listmonk's own address when LISTMONK_ROOT_URL is not set: compose.yaml's. */
export const DEFAULT_ROOT_URL = 'http://localhost:9000'

export type ListmonkParams = Record<
  | 'api_token_sha256'
  | 'root_url'
  | 'smtp_host'
  | 'smtp_port'
  | 'smtp_user'
  | 'smtp_password'
  | 'smtp_tls'
  | 'campaigns_token_sha256'
  | 'mailbox_limit_hour'
  | 'mailbox_limit_day'
  | 'email_cap_hour'
  | 'email_cap_day',
  string
>

/** listmonk stores an API token as the lowercase hex of its SHA-256. */
export const hashApiToken = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * The parameters of settings.sql from the environment: LISTMONK_API_TOKEN (required),
 * LISTMONK_ROOT_URL, and the app's SMTP_* settings read as the app reads them (smtpSettings), so
 * listmonk sends through the same server: TLS from the start with SMTP_SECURE, STARTTLS required
 * unless the server is on this computer (Mailpit). deploy/listmonk/prepare.sh reads them the same
 * way on the server: src/lib/deploy-scripts.test.ts compares both runners' parameters for every
 * kind of setting, and tests/integration/listmonk.db.test.ts checks that both store the same
 * settings, the mail server included. Also LISTMONK_CAMPAIGNS_TOKEN (the issues' API user, M11;
 * only its hash, and empty while unset), and the mailbox's limits and the forms' email cap as
 * written (MAILBOX_LIMIT_*, EMAIL_CAP_*), which settings.sql checks and turns into the issues'
 * sending rate.
 */
export function listmonkParams(env: Env = process.env): ListmonkParams {
  const token = env.LISTMONK_API_TOKEN?.trim()
  if (!token) throw new Error('LISTMONK_API_TOKEN is not set')
  const smtp = smtpSettings(env)
  return {
    api_token_sha256: hashApiToken(token),
    root_url: (env.LISTMONK_ROOT_URL?.trim() || DEFAULT_ROOT_URL).replace(/\/+$/, ''),
    smtp_host: smtp?.host ?? '',
    smtp_port: smtp ? String(smtp.port) : '',
    smtp_user: smtp?.auth?.user ?? '',
    smtp_password: smtp?.auth?.pass ?? '',
    smtp_tls: !smtp ? '' : smtp.secure ? 'TLS' : smtp.requireTLS ? 'STARTTLS' : 'none',
    campaigns_token_sha256: env.LISTMONK_CAMPAIGNS_TOKEN?.trim()
      ? hashApiToken(env.LISTMONK_CAMPAIGNS_TOKEN.trim())
      : '',
    mailbox_limit_hour: env.MAILBOX_LIMIT_HOUR?.trim() ?? '',
    mailbox_limit_day: env.MAILBOX_LIMIT_DAY?.trim() ?? '',
    email_cap_hour: env.EMAIL_CAP_HOUR?.trim() ?? '',
    email_cap_day: env.EMAIL_CAP_DAY?.trim() ?? '',
  }
}

type Client = {
  query(text: string, values?: unknown[]): Promise<unknown>
  release(): void
}

/**
 * Runs settings.sql in one transaction on the database of `url` (its owner, or a superuser) and
 * returns what changed, by name (empty: nothing). Throws, changing nothing, when a parameter is
 * unusable or listmonk is not installed there.
 */
export async function applyListmonkSettings(url: string, params: ListmonkParams) {
  const db = drizzle(url)
  const client = (await db.$client.connect()) as unknown as Client
  try {
    await client.query('begin')
    await client.query(
      'create temp table gliagora_params (key text primary key, value text not null) on commit drop',
    )
    const entries = Object.entries(params)
    await client.query(
      'insert into gliagora_params (key, value) select * from unnest($1::text[], $2::text[])',
      [entries.map(([key]) => key), entries.map(([, value]) => value)],
    )
    // Several statements in one simple query: node-postgres returns one result per statement.
    const results = (await client.query(readFileSync(SETTINGS_SQL, 'utf8'))) as {
      rows: { changed?: string }[]
    }[]
    await client.query('commit')
    const changed = results.at(-1)?.rows[0]?.changed ?? ''
    return changed ? changed.split('; ') : []
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
    await db.$client.end()
  }
}
