import { z } from 'zod'

import { type ListmonkSettings, campaignsSettings } from './config'
import { LIST_NAME, ListmonkError, TIMEOUT_MS } from './listmonk'

// The app's calls to listmonk's campaigns (M11, D53; PLAN §13), as a second API user of its own,
// `gliagora-campaigns` (deploy/listmonk/settings.sql), separate from the subscribers' user so that
// each token can do as little as possible: this one may read and manage campaigns of Glia Notes,
// start and stop them (`campaigns:get`, `campaigns:manage`, `campaigns:send`), and read the
// templates (`templates:get`, to find the site's own template); it may not list, read or change
// subscribers or settings, and it has no `subscribers:sql_query`. listmonk 6.2 cannot narrow it
// further: `campaigns:manage` also allows a campaign's test send to subscribers named by address
// (so the token could tell whether an address is subscribed, and mail one), and `campaigns:send`
// starting a draft at once; the app uses neither (PLAN §20, M11 notes: an accepted risk). The same rules as src/lib/newsletter/listmonk.ts:
// `Authorization: token user:token`, never a cookie, no redirect followed, 5 seconds, errors with a
// kind and a status only, never listmonk's answer.
//
// Verified against listmonk v6.2.0 (tests/integration/campaigns.db.test.ts runs a campaign through a
// real one to Mailpit, and checks what this user may not do).

/** The campaign template the site's issues use: nothing but the issue (settings.sql makes it). */
export const TEMPLATE_NAME = 'Glia Notes issue (site)'

/** A campaign's status, as listmonk names it. */
export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'running',
  'paused',
  'cancelled',
  'finished',
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export type Campaign = {
  id: number
  status: CampaignStatus
  /** When listmonk started sending it, or null. */
  startedAt: Date | null
  sendAt: Date | null
}

/** What the site gives listmonk for an issue's campaign. */
export type CampaignInput = {
  name: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>[]
  /** The issue's date: when a scheduled campaign starts (must be in the future). */
  sendAt: Date | null
}

const campaignSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(CAMPAIGN_STATUSES),
  started_at: z.string().nullish(),
  send_at: z.string().nullish(),
})

const idsSchema = z.object({
  results: z.array(z.object({ id: z.number().int().positive(), name: z.string() })).nullish(),
})
const templatesSchema = z.array(
  z.object({ id: z.number().int().positive(), name: z.string(), type: z.string() }),
)

const date = (value: string | null | undefined) => {
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
}

const toCampaign = (row: z.infer<typeof campaignSchema>): Campaign => ({
  id: row.id,
  status: row.status,
  startedAt: date(row.started_at),
  sendAt: date(row.send_at),
})

export type CampaignsClient = {
  /**
   * The campaign with this ID; null when listmonk answers it has none; `hidden` when listmonk
   * refuses to show it (403): its answer to this user for a campaign of no list it may see, and
   * also for one that is gone, so the two cannot be told apart.
   */
  get(id: number): Promise<Campaign | null | 'hidden'>
  /** Makes a draft campaign for Glia Notes, with the site's template. */
  create(input: CampaignInput): Promise<Campaign>
  /** Replaces a draft or scheduled campaign's content. */
  update(id: number, input: CampaignInput): Promise<Campaign>
  /** Changes its status: `scheduled` (from draft), `draft` (from scheduled). */
  setStatus(id: number, status: 'scheduled' | 'draft'): Promise<Campaign>
}

type Options = { fetch?: typeof fetch; timeoutMs?: number }

export function campaignsClient(
  settings: ListmonkSettings,
  { fetch: fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS }: Options = {},
): CampaignsClient {
  const headers = {
    Authorization: `token ${settings.user}:${settings.token}`,
    Accept: 'application/json',
  }

  async function call(
    method: 'GET' | 'POST' | 'PUT',
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
      const name = (error as { name?: unknown } | null)?.name
      throw new ListmonkError(
        signal.aborted || name === 'TimeoutError' || name === 'AbortError'
          ? 'timeout'
          : 'unreachable',
      )
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
      return ((await response.json()) as { data?: unknown } | null)?.data
    } catch {
      throw new ListmonkError(signal.aborted ? 'timeout' : 'invalid')
    }
  }

  function parsed<T>(schema: z.ZodType<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) throw new ListmonkError('invalid')
    return result.data
  }

  let ids: Promise<{ list: number; template: number }> | null = null
  /** The IDs of the list Glia Notes and of the site's template, looked up once. */
  function lookups() {
    ids ??= (async () => {
      const lists = parsed(idsSchema, await call('GET', '/api/lists?per_page=50')).results ?? []
      const list = lists.find((row) => row.name === LIST_NAME)
      const templates = parsed(templatesSchema, await call('GET', '/api/templates?no_body=true'))
      const template = templates.find(
        (row) => row.name === TEMPLATE_NAME && row.type === 'campaign',
      )
      if (!list || !template) throw new ListmonkError('invalid')
      return { list: list.id, template: template.id }
    })().catch((error: unknown) => {
      ids = null
      throw error
    })
    return ids
  }

  async function fields(input: CampaignInput) {
    const { list, template } = await lookups()
    return {
      name: input.name,
      subject: input.subject,
      lists: [list],
      type: 'regular',
      content_type: 'html',
      body: input.html,
      altbody: input.text,
      headers: input.headers,
      template_id: template,
      messenger: 'email',
      tags: ['glia-notes'],
      archive: false,
      send_at: input.sendAt ? input.sendAt.toISOString() : null,
    }
  }

  const isId = (id: number) => Number.isInteger(id) && id > 0 && id <= 2_147_483_647

  return {
    async get(id) {
      if (!isId(id)) return null
      try {
        // 400 or 404: listmonk has no campaign with this ID.
        const data = await call('GET', `/api/campaigns/${id}`, { allowed: [400, 404] })
        return data === null ? null : toCampaign(parsed(campaignSchema, data))
      } catch (error) {
        if (error instanceof ListmonkError && error.status === 403) return 'hidden'
        throw error
      }
    },
    async create(input) {
      const data = await call('POST', '/api/campaigns', { body: await fields(input) })
      return toCampaign(parsed(campaignSchema, data))
    },
    async update(id, input) {
      if (!isId(id)) throw new ListmonkError('invalid')
      const data = await call('PUT', `/api/campaigns/${id}`, { body: await fields(input) })
      return toCampaign(parsed(campaignSchema, data))
    },
    async setStatus(id, status) {
      if (!isId(id)) throw new ListmonkError('invalid')
      const data = await call('PUT', `/api/campaigns/${id}/status`, { body: { status } })
      return toCampaign(parsed(campaignSchema, data))
    },
  }
}

/** A client for the issues' API user from the environment, or null while it is not set up. */
export function campaignsFromEnv(env: Record<string, string | undefined> = process.env) {
  const settings = campaignsSettings(env)
  return settings ? campaignsClient(settings) : null
}
