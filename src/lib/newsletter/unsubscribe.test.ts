import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '../../../messages/en.json'

import { PREVIEW_UUID, unsubscribeLink } from './consent'
import { type ListmonkClient, ListmonkError, type Subscriber } from './listmonk'
import { oneClickUrl, unsubscribePageUrl } from './paths'
import { handleUnsubscribe, unsubscribePagePath } from './unsubscribe'

// Unsubscribing from Glia Notes (src/lib/newsletter/unsubscribe.ts): the page's button and a mail
// program's one-click POST (RFC 8058), which comes from another site without cookies or Origin. A
// link names listmonk's subscriber ID and UUID; the ID is looked up, the UUID compared. The records
// and listmonk itself are tested in tests/integration/newsletter.db.test.ts.

const UUID = '0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9d'
const OTHER_UUID = '0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9e'
const SUBSCRIBER: Subscriber = {
  id: 7,
  uuid: UUID,
  email: 'reader@example.org',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
}
const ORIGIN = 'https://gliagora.com'
const ROUTE = `${ORIGIN}/en/newsletter/unsubscribe/use/`
const DONE = 'Unsubscribed from Glia Notes. If this address was on the list, it is deleted.'

function fakes({ found = SUBSCRIBER as Subscriber | null } = {}) {
  const listmonk = {
    findById: vi.fn(async () => found),
    remove: vi.fn(async () => {}),
  } as unknown as ListmonkClient & {
    findById: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  const record = vi.fn(async () => {})
  return { listmonk, record }
}

/** A mail program's one-click POST: the subscriber in the address, no Origin, no cookie. */
const oneClick = (query = `?id=7&s=${UUID}`) =>
  new Request(`${ROUTE}${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  })

/** The unsubscribe page's button: the subscriber in hidden fields. */
const button = (
  values: { id?: string | null; s?: string | null } = {},
  headers: Record<string, string> = {},
) => {
  const { id = '7', s = UUID } = values
  const body = new URLSearchParams()
  if (id !== null) body.set('id', id)
  if (s !== null) body.set('s', s)
  return new Request(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  })
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the unsubscribe links', () => {
  it('name the subscriber by ID and UUID, as listmonk’s issues will (M11)', () => {
    expect(unsubscribePageUrl(ORIGIN, 7, UUID)).toBe(
      `${ORIGIN}/en/newsletter/unsubscribe/?id=7&s=${UUID}`,
    )
    expect(oneClickUrl(ORIGIN, 7, UUID)).toBe(
      `${ORIGIN}/en/newsletter/unsubscribe/use/?id=7&s=${UUID}`,
    )
  })

  it('are read strictly: a positive int4 ID without sign or leading zero, a UUID, or the preview', () => {
    expect(unsubscribeLink('7', UUID.toUpperCase())).toEqual({ id: 7, uuid: UUID })
    expect(unsubscribeLink('2147483647', UUID)).toEqual({ id: 2147483647, uuid: UUID })
    for (const id of ['0', '-7', '+7', '07', '7.0', '1e3', ' 7', '2147483648', '', null, ['7']]) {
      expect(unsubscribeLink(id, UUID), JSON.stringify(id)).toBeNull()
    }
    for (const s of ['', 'not-a-uuid', `${UUID}x`, "' OR 1=1 --", null]) {
      expect(unsubscribeLink('7', s), JSON.stringify(s)).toBeNull()
    }
    expect(unsubscribeLink('0', PREVIEW_UUID)).toBe('preview')
    expect(unsubscribeLink(null, PREVIEW_UUID)).toBe('preview')
  })
})

describe('handleUnsubscribe', () => {
  it('takes a one-click POST from another site without Origin: 200, text, at once', async () => {
    const deps = fakes()
    const response = await handleUnsubscribe(oneClick(), deps)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await response.text()).toBe(DONE)
    expect(deps.listmonk.findById).toHaveBeenCalledWith(7)
    expect(deps.record).toHaveBeenCalledWith(SUBSCRIBER, 'one-click')
    expect(deps.listmonk.remove).toHaveBeenCalledWith(7)
    // The records are written before listmonk is asked to delete.
    expect(deps.record.mock.invocationCallOrder[0]!).toBeLessThan(
      deps.listmonk.remove.mock.invocationCallOrder[0]!,
    )
  })

  it('takes the page’s button, from another site too, and leads to unsubscribed/', async () => {
    for (const headers of [
      { 'sec-fetch-site': 'same-origin' },
      { origin: 'https://mail.example' },
    ] as Record<string, string>[]) {
      const deps = fakes()
      const response = await handleUnsubscribe(button({ s: UUID.toUpperCase() }, headers), deps)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/en/newsletter/unsubscribed/')
      expect(deps.record).toHaveBeenCalledWith(SUBSCRIBER, 'unsubscribe-link')
    }
  })

  it('gives an unknown ID, another subscriber’s UUID or the preview UUID the same answer, and does nothing', async () => {
    const cases = [
      { deps: fakes({ found: null }), id: '7', s: UUID },
      { deps: fakes(), id: '7', s: OTHER_UUID },
      { deps: fakes(), id: '0', s: PREVIEW_UUID },
    ]
    for (const { deps, id, s } of cases) {
      const query = `?id=${id}&s=${s}`
      const click = await handleUnsubscribe(oneClick(query), deps)
      expect(click.status, query).toBe(200)
      expect(await click.text()).toBe(DONE)
      const pressed = await handleUnsubscribe(button({ id, s }), deps)
      expect(pressed.headers.get('location')).toBe('/en/newsletter/unsubscribed/')
      expect(deps.record).not.toHaveBeenCalled()
      expect(deps.listmonk.remove).not.toHaveBeenCalled()
    }
    // The preview UUID is never looked up.
    expect(cases[2]!.deps.listmonk.findById).not.toHaveBeenCalled()
  })

  it('compares the UUID in full: one that differs in its last character is another subscriber’s', async () => {
    const deps = fakes({ found: { ...SUBSCRIBER, uuid: OTHER_UUID } })
    await handleUnsubscribe(oneClick(), deps)
    expect(deps.record).not.toHaveBeenCalled()
  })

  it('sends an incomplete link back to the page, which says so, and asks listmonk nothing', async () => {
    for (const values of [
      { id: null },
      { s: null },
      { id: '', s: '' },
      { id: 'abc' },
      { s: 'not-a-uuid' },
      { id: '-1' },
      { id: '2147483648' },
    ]) {
      const deps = fakes()
      const pressed = await handleUnsubscribe(button(values), deps)
      expect(pressed.headers.get('location'), JSON.stringify(values)).toBe(
        '/en/newsletter/unsubscribe/',
      )
      expect(deps.listmonk.findById).not.toHaveBeenCalled()
    }
    const deps = fakes()
    const click = await handleUnsubscribe(oneClick(`?s=${UUID}`), deps)
    expect(click.status).toBe(400)
    expect(deps.listmonk.findById).not.toHaveBeenCalled()
  })

  it('answers "unsubscribed" when listmonk fails to delete: the deletion log repeats it', async () => {
    const deps = fakes()
    deps.listmonk.remove.mockRejectedValue(new ListmonkError('unreachable'))
    expect((await handleUnsubscribe(oneClick(), deps)).status).toBe(200)
    expect(deps.record).toHaveBeenCalled()
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain('ListmonkError')
  })

  it('changes nothing when listmonk cannot be asked (or refuses: outside Glia Notes), and says so', async () => {
    for (const failure of [new ListmonkError('timeout'), new ListmonkError('status', 403)]) {
      const deps = fakes()
      deps.listmonk.findById.mockRejectedValue(failure)
      const response = await handleUnsubscribe(oneClick(), deps)
      expect(response.status).toBe(503)
      expect(deps.record).not.toHaveBeenCalled()
      const page = await handleUnsubscribe(button(), deps)
      expect(page.headers.get('location')).toMatch(
        new RegExp(
          `^/en/newsletter/unsubscribe/\\?id=7&s=${UUID}&error=failed&ref=[0-9A-F]{10}#outcome$`,
        ),
      )
    }
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('ListmonkError timeout')
    expect(logged).toContain('ListmonkError status-403')
    expect(logged).not.toContain(UUID)
  })

  it('says "temporarily unavailable" while the newsletter is off', async () => {
    const off = { listmonk: null, record: vi.fn(async () => {}) }
    expect((await handleUnsubscribe(oneClick(), off)).status).toBe(503)
    expect((await handleUnsubscribe(button(), off)).headers.get('location')).toBe(
      `/en/newsletter/unsubscribe/?id=7&s=${UUID}&error=unavailable#outcome`,
    )
  })

  it('sends an address opened in the browser to the page, with the same subscriber', () => {
    expect(unsubscribePagePath(new Request(`${ROUTE}?id=7&s=${UUID}`))).toBe(
      `/en/newsletter/unsubscribe/?id=7&s=${UUID}`,
    )
    expect(unsubscribePagePath(new Request(`${ROUTE}?id=0&s=${PREVIEW_UUID}`))).toBe(
      `/en/newsletter/unsubscribe/?s=${PREVIEW_UUID}`,
    )
    for (const query of ['?s=<script>', `?s=${UUID}`, '?id=7', '']) {
      expect(unsubscribePagePath(new Request(`${ROUTE}${query}`))).toBe(
        '/en/newsletter/unsubscribe/',
      )
    }
  })

  it('never says an address was deleted when it may not have been on the list', () => {
    expect(en.newsletter.unsubscribed.text).toMatch(/If this address was on the list/)
    expect(DONE).toMatch(/If this address was on the list/)
  })
})
