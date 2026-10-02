import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The proxy in the M2 state with every text approved (draft: false), whatever today's approvals
// are (src/proxy.test.ts tests today's): what opens with the açık rıza metni, the Glia Notes signup
// and the pages and routes after it (D50).
vi.mock('./lib/content', async (importOriginal) => {
  const original = await importOriginal<typeof import('./lib/content')>()
  return {
    ...original,
    CONTENT_PAGES: Object.fromEntries(
      Object.entries(original.CONTENT_PAGES).map(([key, page]) => [key, { ...page, draft: false }]),
    ),
  }
})

const { NEWSLETTER_PATHS } = await import('./lib/newsletter/paths')
const { PUBLIC_MARK } = await import('./lib/public-pages')
const { proxy } = await import('./proxy')

const request = (path: string, method = 'GET', headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, 'http://localhost:3000'), { method, headers })

const rewrite = (response: Response) => {
  const target = response.headers.get('x-middleware-rewrite')
  return target ? new URL(target) : null
}
const mark = (response: Response) => response.headers.get(PUBLIC_MARK.name)
const viaPublic = { [PUBLIC_MARK.name]: PUBLIC_MARK.value }

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('proxy: Glia Notes in the M2 state, with the açık rıza metni approved', () => {
  const PAGES = [
    NEWSLETTER_PATHS.signup,
    NEWSLETTER_PATHS.checkInbox,
    NEWSLETTER_PATHS.confirm,
    NEWSLETTER_PATHS.confirmed,
    NEWSLETTER_PATHS.unsubscribe,
    NEWSLETTER_PATHS.unsubscribed,
  ]
  const ROUTES = [
    NEWSLETTER_PATHS.resend,
    NEWSLETTER_PATHS.confirmUse,
    NEWSLETTER_PATHS.unsubscribeUse,
  ]

  it('shows the pages in their M2 versions, marked, keeping the query (the links’ token)', async () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    for (const path of PAGES) {
      for (const method of ['GET', 'HEAD']) {
        const response = await proxy(request(path, method, viaPublic))
        expect(rewrite(response)?.pathname, `${method} ${path}`).toBe(`/m2${path}`)
        expect(mark(response), `${method} ${path}`).toBe(PUBLIC_MARK.value)
      }
    }
    const confirm = rewrite(await proxy(request(`${NEWSLETTER_PATHS.confirm}?token=abc`)))
    expect(confirm?.search).toBe('?token=abc')
    // The signup's Server Action posts to its page, which renders again in the same version.
    const signup = await proxy(request(NEWSLETTER_PATHS.signup, 'POST', viaPublic))
    expect(rewrite(signup)?.pathname).toBe(`/m2${NEWSLETTER_PATHS.signup}`)
    expect(mark(signup)).toBe(PUBLIC_MARK.value)
    // The other pages take no POST through Caddy's public handles.
    const refused = await proxy(request(NEWSLETTER_PATHS.confirmed, 'POST', viaPublic))
    expect(refused.status).toBe(404)
  })

  it('marks the answers of the routes behind the buttons, never rewriting them', async () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    for (const path of ROUTES) {
      for (const method of ['GET', 'POST']) {
        const response = await proxy(request(path, method, viaPublic))
        expect(response.headers.get('x-middleware-next'), `${method} ${path}`).toBe('1')
        expect(rewrite(response), `${method} ${path}`).toBeNull()
        // Caddy passes a 200, 400 or 503 of the route only with the mark (a 303 without it).
        expect(mark(response), `${method} ${path}`).toBe(PUBLIC_MARK.value)
      }
    }
  })

  it('lets a mail program’s one-click unsubscribe through: no Origin, no cookie, its query', async () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    const response = await proxy(
      request(
        `${NEWSLETTER_PATHS.unsubscribeUse}?id=1&s=00000000-0000-4000-8000-000000000000`,
        'POST',
        {
          ...viaPublic,
          'content-type': 'application/x-www-form-urlencoded',
        },
      ),
    )
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(mark(response)).toBe(PUBLIC_MARK.value)
  })

  it('holds nothing of it public in the private stage', async () => {
    vi.stubEnv('SITE_STAGE', 'private')
    for (const path of [...PAGES, ...ROUTES]) {
      const response = await proxy(request(path, 'POST', viaPublic))
      expect(response.status, path).toBe(404)
      expect(mark(response), path).toBeNull()
      const plain = await proxy(request(path))
      expect(rewrite(plain), path).toBeNull()
      expect(mark(plain), path).toBeNull()
    }
  })
})
