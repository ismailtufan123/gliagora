import { describe, expect, it, vi } from 'vitest'

import { errorSummary } from '@/lib/errors'

import { LIST_PAGE_SIZE, ListmonkError, exactPattern, listmonkClient } from './listmonk'

// The app's listmonk client (src/lib/newsletter/listmonk.ts) against a stand-in for listmonk's API:
// what it sends (and never sends: an SQL expression, a cookie), how it reads the answers, and that
// its errors carry no answer, address, ID or UUID. tests/integration/newsletter.db.test.ts runs the same calls against a real one.

const SETTINGS = { url: 'http://listmonk.test:9000', user: 'gliagora-app', token: 't'.repeat(64) }
const UUID = '0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9d'
const ROW = {
  id: 7,
  uuid: UUID,
  email: 'reader@example.org',
  name: 'Subscriber',
  created_at: '2026-10-02T10:00:00.000Z',
}

type Call = { method: string; url: URL; headers: Headers; body: unknown }

/** A stand-in for listmonk: answers each call with `answer(call)`, and records it. */
function fakeListmonk(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call = {
      method: init?.method ?? 'GET',
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    return answer(call)
  })
  const client = listmonkClient(SETTINGS, { fetch: fetch as unknown as typeof globalThis.fetch })
  return { client, calls, fetch }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
const lists = () => json({ results: [{ id: 3, name: 'Glia Notes' }] })

describe('listmonkClient', () => {
  it('signs every call as the API user, and sends no cookie', async () => {
    const { client, calls } = fakeListmonk(() => json({ results: [] }))
    await client.findByEmail('reader@example.org')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.headers.get('authorization')).toBe(`token gliagora-app:${'t'.repeat(64)}`)
    expect(calls[0]!.headers.get('cookie')).toBeNull()
    expect(calls[0]!.url.origin).toBe('http://listmonk.test:9000')
  })

  it('finds an address by an anchored, escaped pattern, and only that address', async () => {
    const { client, calls } = fakeListmonk(() =>
      json({
        results: [
          { ...ROW, id: 8, email: 'reader@example.org.evil' },
          { ...ROW, email: 'reader@example.org' },
        ],
      }),
    )
    expect(await client.findByEmail('Reader@Example.org')).toEqual({
      id: 7,
      uuid: UUID,
      email: 'reader@example.org',
      createdAt: new Date('2026-10-02T10:00:00.000Z'),
    })
    expect(calls[0]!.url.pathname).toBe('/api/subscribers')
    expect(calls[0]!.url.searchParams.get('search')).toBe('^reader\\@example\\.org$')
    expect(calls[0]!.url.searchParams.get('per_page')).toBe('50')
    // Every character of an address that a pattern could read is escaped.
    expect(exactPattern("a.b+c_d-e'f*g?h|i(j)k[l]m{n}o^p$q/r=s!t#u%v&w`x~y@z.org")).toBe(
      "^a\\.b\\+c\\_d\\-e\\'f\\*g\\?h\\|i\\(j\\)k\\[l\\]m\\{n\\}o\\^p\\$q\\/r\\=s\\!t\\#u\\%v\\&w\\`x\\~y\\@z\\.org$",
    )
  })

  it('finds a subscriber by its ID, only once it is a positive int4; an unknown ID is null', async () => {
    const { client, calls } = fakeListmonk((call) =>
      call.url.pathname === '/api/subscribers/7'
        ? json(ROW)
        : new Response('{"message":"Subscriber (8: ) not found"}', { status: 400 }),
    )
    for (const id of [0, -1, 1.5, 2 ** 31, Number.NaN]) expect(await client.findById(id)).toBeNull()
    expect(calls).toHaveLength(0)
    expect(await client.findById(7)).toEqual({
      id: 7,
      uuid: UUID,
      email: 'reader@example.org',
      createdAt: new Date('2026-10-02T10:00:00.000Z'),
    })
    expect(`${calls[0]!.method} ${calls[0]!.url.pathname}${calls[0]!.url.search}`).toBe(
      'GET /api/subscribers/7',
    )
    expect(await client.findById(8)).toBeNull()
    // Another subscriber in the answer than the one asked for is not believed.
    const odd = fakeListmonk(() => json({ ...ROW, id: 9 }))
    await expect(odd.client.findById(7)).rejects.toMatchObject({ kind: 'invalid' })
    // Outside Glia Notes (403): an error, never "not there".
    const outside = fakeListmonk(() => new Response('{}', { status: 403 }))
    await expect(outside.client.findById(7)).rejects.toMatchObject({ kind: 'status', status: 403 })
  })

  it('reads the list of Glia Notes page by page, by ID, LIST_PAGE_SIZE at a time', async () => {
    const { client, calls } = fakeListmonk((call) => {
      if (call.url.pathname === '/api/lists') return lists()
      const page = Number(call.url.searchParams.get('page'))
      return json({
        results: page === 1 ? [ROW, { ...ROW, id: 8, uuid: UUID.replace('d9d', 'd9e') }] : null,
        total: 2,
        per_page: LIST_PAGE_SIZE,
        page,
      })
    })
    expect(await client.listPage(1)).toEqual({
      subscribers: [expect.objectContaining({ id: 7 }), expect.objectContaining({ id: 8 })],
      total: 2,
    })
    expect(await client.listPage(2)).toEqual({ subscribers: [], total: 2 })
    const asked = calls.filter((call) => call.url.pathname === '/api/subscribers')
    expect(Object.fromEntries(asked[0]!.url.searchParams)).toEqual({
      list_id: '3',
      per_page: String(LIST_PAGE_SIZE),
      page: '1',
      order_by: 'subscribers.id',
      order: 'asc',
    })
    await expect(client.listPage(0)).rejects.toMatchObject({ kind: 'invalid' })
    // A listmonk that pages differently than asked would skip subscribers: refused.
    const clamped = fakeListmonk((call) =>
      call.url.pathname === '/api/lists'
        ? lists()
        : json({ results: [ROW], total: 1, per_page: 50, page: 1 }),
    )
    await expect(clamped.client.listPage(1)).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('never sends an SQL expression (listmonk’s `query`), whatever it is asked', async () => {
    const { client, calls } = fakeListmonk((call) => {
      if (call.url.pathname === '/api/lists') return lists()
      if (call.method === 'POST') return new Response('{}', { status: 409 })
      if (call.url.pathname === '/api/subscribers/7') return json(ROW)
      if (call.url.searchParams.has('page')) {
        return json({ results: [ROW], total: 1, per_page: LIST_PAGE_SIZE, page: 1 })
      }
      if (call.method === 'GET') return json({ results: [ROW] })
      return json(true)
    })
    await client.findByEmail("x' OR 1=1 --@example.org")
    await client.findByEmail('reader@example.org')
    await client.findById(7)
    await client.listPage(1)
    await client.subscribe('reader@example.org')
    await client.changeEmail(7, 'new@example.org')
    await client.remove(7)
    expect(calls.length).toBeGreaterThan(7)
    for (const call of calls) {
      expect(call.url.searchParams.has('query'), call.url.toString()).toBe(false)
      expect(call.url.toString()).not.toMatch(/[?&]query=/)
      expect(JSON.stringify(call.body ?? {})).not.toContain('"query"')
    }
  })

  it('subscribes an address as a confirmed subscriber of Glia Notes', async () => {
    const { client, calls } = fakeListmonk((call) =>
      call.url.pathname === '/api/lists' ? lists() : json(ROW),
    )
    expect(await client.subscribe('reader@example.org')).toMatchObject({
      id: 7,
      uuid: UUID,
      created: true,
    })
    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      'GET /api/lists',
      'POST /api/subscribers',
    ])
    expect(calls[1]!.headers.get('content-type')).toBe('application/json')
    expect(calls[1]!.body).toEqual({
      email: 'reader@example.org',
      name: 'Subscriber',
      status: 'enabled',
      lists: [3],
      preconfirm_subscriptions: true,
    })
    // The list's ID is asked for once.
    await client.subscribe('second@example.org')
    expect(calls.filter((call) => call.url.pathname === '/api/lists')).toHaveLength(1)
  })

  it('adds an address listmonk has already to the list, confirmed', async () => {
    const { client, calls } = fakeListmonk((call) => {
      if (call.url.pathname === '/api/lists') return lists()
      if (call.method === 'POST') {
        return new Response('{"message":"E-mail already exists."}', { status: 409 })
      }
      if (call.method === 'GET') return json({ results: [ROW] })
      return json(true)
    })
    expect(await client.subscribe('reader@example.org')).toMatchObject({ id: 7, created: false })
    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      'GET /api/lists',
      'POST /api/subscribers',
      'GET /api/subscribers',
      'PUT /api/subscribers/lists',
    ])
    expect(calls[3]!.body).toEqual({
      ids: [7],
      action: 'add',
      target_list_ids: [3],
      status: 'confirmed',
    })
  })

  it('refuses an address listmonk has but does not show the app (another list)', async () => {
    const { client } = fakeListmonk((call) => {
      if (call.url.pathname === '/api/lists') return lists()
      if (call.method === 'POST') return new Response('{}', { status: 409 })
      return json({ results: [] })
    })
    await expect(client.subscribe('reader@example.org')).rejects.toMatchObject({
      name: 'ListmonkError',
      kind: 'conflict',
      status: 409,
    })
  })

  it('deletes and changes subscribers by their ID only', async () => {
    const { client, calls } = fakeListmonk(() => json(true))
    await client.remove(7)
    await client.changeEmail(7, 'New@Example.org')
    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      'DELETE /api/subscribers/7',
      'PATCH /api/subscribers/7',
    ])
    expect(calls[1]!.body).toEqual({ email: 'new@example.org' })
    await expect(client.remove(0)).rejects.toThrow(ListmonkError)
    expect(calls).toHaveLength(2)
  })

  it('fails with a kind and a status only, never listmonk’s answer, the address or the UUID', async () => {
    const answer = '{"message":"reader@example.org: ' + UUID + ' is not allowed"}'
    const refused = fakeListmonk(() => new Response(answer, { status: 403 }))
    const error = await refused.client.findByEmail('reader@example.org').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ListmonkError)
    expect(error).toMatchObject({ kind: 'status', status: 403 })
    expect(errorSummary(error)).toBe('ListmonkError status-403')
    const text = `${String(error)} ${JSON.stringify(error)} ${(error as Error).stack}`
    expect(text).not.toContain('reader@example.org')
    expect(text).not.toContain(UUID)
    expect(text).not.toContain('not allowed')

    const down = fakeListmonk(() => Promise.reject(new TypeError('fetch failed')))
    await expect(down.client.findById(7)).rejects.toMatchObject({ kind: 'unreachable' })

    const garbled = fakeListmonk(() => new Response('<html>', { status: 200 }))
    await expect(garbled.client.findById(7)).rejects.toMatchObject({ kind: 'invalid' })
    const odd = fakeListmonk(() => json({ results: [{ id: 'seven' }] }))
    await expect(odd.client.findByEmail('reader@example.org')).rejects.toMatchObject({
      kind: 'invalid',
    })
    const failing = fakeListmonk(() => new Response(answer, { status: 500 }))
    const failed = await failing.client.findById(7).catch((e: unknown) => e)
    expect(failed).toMatchObject({ kind: 'status', status: 500 })
    expect(`${String(failed)} ${(failed as Error).stack}`).not.toMatch(/reader@|not allowed/)
    const noList = fakeListmonk(() => json({ results: [{ id: 1, name: 'Other' }] }))
    await expect(noList.client.subscribe('reader@example.org')).rejects.toMatchObject({
      kind: 'invalid',
    })
  })

  it('gives up after its time limit', async () => {
    const fetch = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
          )
        }),
    )
    const client = listmonkClient(SETTINGS, {
      fetch: fetch as unknown as typeof globalThis.fetch,
      timeoutMs: 20,
    })
    await expect(client.findById(7)).rejects.toMatchObject({ kind: 'timeout' })
  })
})
