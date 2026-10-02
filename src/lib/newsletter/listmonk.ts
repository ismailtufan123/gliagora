import { z } from 'zod'

import { type ListmonkSettings, listmonkSettings } from './config'
import { SUBSCRIBER_UUID_PATTERN, isSubscriberId } from './consent'

// The app's calls to listmonk's API (M2, D50; PLAN §13), as its own API user (`gliagora-app`,
// deploy/listmonk/settings.sql), which sees and changes the subscribers of Glia Notes only. listmonk
// holds only confirmed subscribers: the site runs the double opt-in itself and adds an address
// only once its owner has confirmed it (src/lib/newsletter/confirm.ts).
//
// - `Authorization: token <user>:<token>` and never a Cookie header (listmonk then ignores the
//   Authorization header); never a redirect followed; never Next.js's fetch cache.
// - Each call ends after 5 seconds (TIMEOUT_MS): a person may be waiting for the page.
// - A failure is a ListmonkError with a kind and the HTTP status, never listmonk's answer, which
//   can quote the address, nor the address, ID or UUID asked about. Callers log `errorSummary()`.
// - Never an SQL expression (listmonk's `query`): the API user has only `subscribers:get` and
//   `subscribers:manage` (with its list role), and listmonk 6.2 answers `query` with 403 without
//   `subscribers:sql_query`, which the user must never have (it lets a function such as
//   `query_to_xml` read every table of listmonk's database; deploy/listmonk/settings.sql). A
//   subscriber is found by its ID (`GET /api/subscribers/:id`, unknown: 400; outside Glia Notes:
//   403), by its address (`search`, an anchored regular expression with every character but letters
//   and digits escaped, then compared exactly here, since listmonk also matches names), or in the
//   list of Glia Notes' subscribers, read page by page (`list_id`). An ID reaches an address only
//   once it is a positive `int4`.
//
// Verified against listmonk v6.2.0 (tests/integration/newsletter.db.test.ts runs these calls
// against a real one, tests/integration/listmonk.db.test.ts the API user's permissions).

/** How long a call to listmonk may take, answer included. */
export const TIMEOUT_MS = 5_000

/** The list the site manages (deploy/listmonk/settings.sql makes it). */
export const LIST_NAME = 'Glia Notes'

/** The name every subscriber gets: listmonk would otherwise take the address's local part. */
export const SUBSCRIBER_NAME = 'Subscriber'

/** Rows per page of a search (an address matches one subscriber; listmonk's default maximum). */
const PAGE_MAX = 50

/**
 * Subscribers per page when the list is read whole (`listPage`): listmonk 6.2 allows any page size
 * (its paginator's `AllowAll`); 500 reads 10,000 subscribers in about two seconds, where pages of 50
 * take nine times as long. The answer repeats the size; another size is refused as `invalid`.
 */
export const LIST_PAGE_SIZE = 500

export type ListmonkErrorKind =
  /** The newsletter is off: no listmonk settings. */
  | 'off'
  /** listmonk could not be reached. */
  | 'unreachable'
  /** listmonk took longer than TIMEOUT_MS. */
  | 'timeout'
  /** listmonk answered with an error status. */
  | 'status'
  /** listmonk's answer was not what the API documents. */
  | 'invalid'
  /** An address listmonk says it has, yet does not show the app (not in Glia Notes). */
  | 'conflict'

/** A failed call: its kind and HTTP status only (`code` for errorSummary()). */
export class ListmonkError extends Error {
  override name = 'ListmonkError'
  readonly kind: ListmonkErrorKind
  readonly status?: number
  readonly code: string

  constructor(kind: ListmonkErrorKind, status?: number) {
    super(`listmonk call failed (${kind}${status ? ` ${status}` : ''})`)
    this.kind = kind
    this.status = status
    this.code = status ? `${kind}-${status}` : kind
  }
}

/** A subscriber as the app needs it. */
export type Subscriber = { id: number; uuid: string; email: string; createdAt: Date | null }

export type ListmonkClient = {
  /** The ID of the list Glia Notes (looked up once per client). */
  listId(): Promise<number>
  /** The subscriber with this address (stored form), or null. */
  findByEmail(email: string): Promise<Subscriber | null>
  /**
   * The subscriber with this ID, or null when listmonk has none (also for anything that is not an
   * ID, asked nothing). One listmonk has outside Glia Notes is an error (`status` 403): the app
   * may neither see nor change it.
   */
  findById(id: number): Promise<Subscriber | null>
  /**
   * One page (from 1) of Glia Notes' subscribers, by ID ascending, LIST_PAGE_SIZE at a time, with
   * listmonk's count of them all; a page after the last is empty.
   */
  listPage(page: number): Promise<{ subscribers: Subscriber[]; total: number }>
  /**
   * Makes `email` a confirmed subscriber of Glia Notes: a new subscriber, or, when listmonk has the
   * address already, that one added to the list as confirmed. `created` says which.
   */
  subscribe(email: string): Promise<Subscriber & { created: boolean }>
  /** Changes a subscriber's address (members' address changes, PR D). */
  changeEmail(id: number, email: string): Promise<void>
  /** Deletes a subscriber with its subscriptions (also when it is gone already). */
  remove(id: number): Promise<void>
}

const subscriberSchema = z.object({
  id: z.number().int().positive(),
  uuid: z.string().regex(SUBSCRIBER_UUID_PATTERN),
  email: z.string(),
  created_at: z.string().nullish(),
})

const resultsSchema = z.object({ results: z.array(subscriberSchema).nullish() })
const pageSchema = z.object({
  results: z.array(subscriberSchema).nullish(),
  total: z.number().int().min(0),
  per_page: z.number().int(),
})
const listsSchema = z.object({
  results: z.array(z.object({ id: z.number().int().positive(), name: z.string() })).nullish(),
})

function toSubscriber(row: z.infer<typeof subscriberSchema>): Subscriber {
  const created = row.created_at ? new Date(row.created_at) : null
  return {
    id: row.id,
    uuid: row.uuid,
    email: row.email.toLowerCase(),
    createdAt: created && !Number.isNaN(created.getTime()) ? created : null,
  }
}

/**
 * An anchored regular expression that matches exactly `text` (PostgreSQL's ARE, as `~*`): every
 * ASCII character but letters and digits escaped (a backslash before any other character means
 * that character). The forms take ASCII addresses only (src/lib/forms/text.ts).
 */
export const exactPattern = (text: string) =>
  `^${text.replace(/[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g, '\\$&')}$`

type Options = {
  /** The fetch to use (tests pass their own). */
  fetch?: typeof fetch
  timeoutMs?: number
}

/** A client for listmonk at `settings`. */
export function listmonkClient(
  settings: ListmonkSettings,
  { fetch: fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS }: Options = {},
): ListmonkClient {
  const headers = {
    Authorization: `token ${settings.user}:${settings.token}`,
    Accept: 'application/json',
  }

  /**
   * One call: the `data` of listmonk's answer, or `null` for a status in `allowed` (a 409). Throws
   * a ListmonkError on anything else.
   */
  async function call(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    { body, allowed = [] }: { body?: unknown; allowed?: number[] } = {},
  ): Promise<unknown> {
    const signal = AbortSignal.timeout(timeoutMs)
    let response: Response
    try {
      response = await fetchImpl(`${settings.url}${path}`, {
        method,
        headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
        cache: 'no-store',
        signal,
      })
    } catch (error) {
      throw new ListmonkError(signal.aborted || isTimeout(error) ? 'timeout' : 'unreachable')
    }
    if (allowed.includes(response.status)) {
      await response.body?.cancel().catch(() => {})
      return null
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new ListmonkError('status', response.status)
    }
    try {
      const json = (await response.json()) as { data?: unknown } | null
      return json?.data
    } catch {
      throw new ListmonkError(signal.aborted ? 'timeout' : 'invalid')
    }
  }

  /** Reads `data` with `schema`, or throws `invalid`. */
  function parsed<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) throw new ListmonkError('invalid')
    return result.data
  }

  /** A GET of `/api/subscribers` with these parameters (never `query`, see above). */
  function subscribersCall(params: Record<string, string>): Promise<unknown> {
    return call('GET', `/api/subscribers?${new URLSearchParams(params).toString()}`)
  }

  let list: Promise<number> | null = null
  const client: ListmonkClient = {
    listId() {
      list ??= (async () => {
        const data = await call('GET', `/api/lists?per_page=${PAGE_MAX}`)
        const found = (parsed(listsSchema, data).results ?? []).find(
          (row) => row.name === LIST_NAME,
        )
        if (!found) throw new ListmonkError('invalid')
        return found.id
      })().catch((error: unknown) => {
        list = null
        throw error
      })
      return list
    },

    async findByEmail(email) {
      const wanted = email.trim().toLowerCase()
      if (!wanted) return null
      const data = await subscribersCall({
        search: exactPattern(wanted),
        per_page: String(PAGE_MAX),
      })
      const rows = (parsed(resultsSchema, data).results ?? []).map(toSubscriber)
      return rows.find((row) => row.email === wanted) ?? null
    },

    async findById(id) {
      if (!isSubscriberId(id)) return null
      // 400: listmonk has no subscriber with this ID ("not found").
      const data = await call('GET', `/api/subscribers/${id}`, { allowed: [400] })
      if (data === null) return null
      const subscriber = toSubscriber(parsed(subscriberSchema, data))
      if (subscriber.id !== id) throw new ListmonkError('invalid')
      return subscriber
    },

    async listPage(page) {
      if (!Number.isInteger(page) || page < 1) throw new ListmonkError('invalid')
      const data = await subscribersCall({
        list_id: String(await client.listId()),
        per_page: String(LIST_PAGE_SIZE),
        page: String(page),
        order_by: 'subscribers.id',
        order: 'asc',
      })
      const result = parsed(pageSchema, data)
      if (result.per_page !== LIST_PAGE_SIZE) throw new ListmonkError('invalid')
      return { subscribers: (result.results ?? []).map(toSubscriber), total: result.total }
    },

    async subscribe(email) {
      const address = email.trim().toLowerCase()
      const listId = await client.listId()
      const data = await call('POST', '/api/subscribers', {
        body: {
          email: address,
          name: SUBSCRIBER_NAME,
          status: 'enabled',
          lists: [listId],
          preconfirm_subscriptions: true,
        },
        allowed: [409],
      })
      if (data !== null) return { ...toSubscriber(parsed(subscriberSchema, data)), created: true }
      // listmonk has the address already: add it to the list, confirmed.
      const existing = await client.findByEmail(address)
      if (!existing) throw new ListmonkError('conflict', 409)
      await call('PUT', '/api/subscribers/lists', {
        body: {
          ids: [existing.id],
          action: 'add',
          target_list_ids: [listId],
          status: 'confirmed',
        },
      })
      return { ...existing, created: false }
    },

    async changeEmail(id, email) {
      if (!isSubscriberId(id)) throw new ListmonkError('invalid')
      await call('PATCH', `/api/subscribers/${id}`, { body: { email: email.trim().toLowerCase() } })
    },

    async remove(id) {
      if (!isSubscriberId(id)) throw new ListmonkError('invalid')
      await call('DELETE', `/api/subscribers/${id}`)
    },
  }
  return client
}

function isTimeout(error: unknown) {
  const name = (error as { name?: unknown } | null)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}

/** A client from the environment's settings, or null while the newsletter is off. */
export function listmonkFromEnv(env: Record<string, string | undefined> = process.env) {
  const settings = listmonkSettings(env)
  return settings ? listmonkClient(settings) : null
}
