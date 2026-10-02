import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CONTENT_PAGES } from './lib/content'
import { M2_PAGES, PUBLIC_MARK } from './lib/public-pages'
import { proxy } from './proxy'

// The canonical redirect of filtered lists (PLAN §2.1, §2.4). Record pages need the database and
// are checked end to end (tests/e2e/http.spec.ts).
const request = (path: string, method = 'GET', headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, 'http://localhost:3000'), { method, headers })

describe('proxy: filtered lists', () => {
  it('redirects the filter form’s address permanently to the canonical one, cacheably', async () => {
    const response = await proxy(
      request('/en/jobs/?q=&type=phd&type=msc&sort=deadline&deadline=&deadline-from=&deadline-to='),
    )
    expect(response.status).toBe(308)
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/en/jobs/')
    expect(response.headers.get('location')).toMatch(/\/en\/jobs\/\?type=msc,phd$/)
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
  })

  it('redirects HEAD requests too, but not other methods', async () => {
    expect((await proxy(request('/en/jobs/?type=PhD', 'HEAD'))).status).toBe(308)
    expect((await proxy(request('/en/jobs/?type=PhD', 'POST'))).status).toBe(200)
  })

  it('lets canonical addresses through, with commas written either way', async () => {
    for (const path of [
      '/en/jobs/',
      '/en/jobs/?subfield=glia,motor&type=phd',
      '/en/jobs/?subfield=glia%2Cmotor&type=phd',
      '/en/jobs/?q=two+words&page=2',
    ]) {
      const response = await proxy(request(path))
      expect(response.headers.get('x-middleware-next'), path).toBe('1')
    }
  })

  it('drops unknown parameters and defaults, but keeps campaign tags', async () => {
    const response = await proxy(request('/en/jobs/?utm_source=x&page=1&ref=abc'))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toMatch(/\/en\/jobs\/\?utm_source=x$/)
  })
})

describe('proxy: sitemap files', () => {
  it('lets the names of sitemap files through to their route, which knows whether they exist', async () => {
    for (const path of ['/sitemaps/jobs.xml', '/sitemaps/jobs-2.xml', '/sitemaps/pages-tr.xml']) {
      const response = await proxy(request(path))
      expect(response.headers.get('x-middleware-next'), path).toBe('1')
    }
  })

  it('gives other names under /sitemaps/ the 404 page, not stored', async () => {
    for (const path of [
      '/sitemaps/',
      '/sitemaps/unknown.xml',
      '/sitemaps/wp-login.php',
      '/sitemaps/foo/',
      '/sitemaps/jobs-1.xml',
      '/sitemaps/jobs.xml/extra',
    ]) {
      const response = await proxy(request(path))
      expect(response.status, path).toBe(404)
      expect(new URL(response.headers.get('x-middleware-rewrite') ?? '').pathname, path).toBe(
        '/_not-found',
      )
      expect(response.headers.get('cache-control'), path).toBe('private, no-store')
    }
  })
})

describe('proxy: the M2 state (D41, D50)', () => {
  afterEach(() => vi.unstubAllEnvs())

  const rewrite = (response: Response) => {
    const target = response.headers.get('x-middleware-rewrite')
    return target ? new URL(target) : null
  }

  it('shows the public pages in their M2 versions, for every method, keeping the query', async () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    for (const [path, twin] of [
      ['/en/', '/m2/en/'],
      ['/en/about/', '/m2/en/about/'],
      // Glia Notes, once the açık rıza metni is approved (src/proxy-approved.test.ts tests it
      // with every text approved).
      ...(CONTENT_PAGES.acikRiza.draft ? [] : [['/en/newsletter/', '/m2/en/newsletter/']]),
    ]) {
      for (const method of ['GET', 'HEAD', 'POST']) {
        const response = await proxy(request(path!, method))
        expect(response.status, `${method} ${path}`).toBe(200)
        expect(rewrite(response)?.pathname, `${method} ${path}`).toBe(twin)
      }
    }
    const target = rewrite(await proxy(request('/en/?utm_source=newsletter&x=1')))
    expect(target?.pathname).toBe('/m2/en/')
    expect(target?.search).toBe('?utm_source=newsletter&x=1')
  })

  /** Pages and routes whose text the operator has not approved yet (none, once every text is). */
  const NOT_YET = M2_PAGES.filter((page) => page.approval && CONTENT_PAGES[page.approval].draft)
  const DRAFTS = NOT_YET.filter((page) => page.kind === 'page').map((page) => page.path)

  const mark = (response: Response) => response.headers.get(PUBLIC_MARK.name)

  it('leaves private pages, texts that are not approved and route handlers alone', async () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    for (const path of [
      '/en/suggest/',
      '/en/account/',
      '/en/legal/data-requests/confirm/use/',
      '/en/newsletter/unsubscribe/use/',
      ...DRAFTS,
    ]) {
      const response = await proxy(request(path, 'POST'))
      expect(response.headers.get('x-middleware-next'), path).toBe('1')
      expect(rewrite(response), path).toBeNull()
    }
    // The other rules still apply: a filtered list is redirected to its canonical address.
    expect((await proxy(request('/en/jobs/?type=PhD'))).status).toBe(308)
  })

  it('marks its answers to the public addresses, by its own list and method only', async () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    // Caddy passes an answer to these only with the mark (deploy/caddy/m2-public.caddy).
    for (const path of [
      '/en/',
      '/en/about/',
      '/robots.txt',
      '/sitemap.xml',
      '/sitemaps/pages.xml',
    ]) {
      for (const method of ['GET', 'HEAD']) {
        const response = await proxy(request(path, method))
        expect(mark(response), `${method} ${path}`).toBe(PUBLIC_MARK.value)
        expect(response.status, `${method} ${path}`).toBe(200)
      }
      expect(mark(await proxy(request(path, 'POST'))), `POST ${path}`).toBeNull()
    }
    // A machine file keeps its own checks: the sitemap file is answered by its route.
    expect((await proxy(request('/sitemaps/pages.xml'))).headers.get('x-middleware-next')).toBe('1')
    // What this image does not hold public gets no mark, so Caddy answers it with a plain 404 even
    // when its own copy of the list opens it (a text approved in a later image, after a rollback).
    for (const path of [
      '/en/jobs/',
      '/en/account/',
      '/sitemaps/jobs.xml',
      ...NOT_YET.map((page) => page.path),
    ]) {
      for (const method of ['GET', 'POST']) {
        expect(mark(await proxy(request(path, method))), `${method} ${path}`).toBeNull()
      }
    }
  })

  it('refuses a request through Caddy’s public handles that this image does not hold public', async () => {
    // Caddy's copy of the list opens more than the image holds public (a rollback past an
    // approval): a plain 404, before the page or the route behind a form's button runs.
    const viaPublic = { [PUBLIC_MARK.name]: PUBLIC_MARK.value }
    const refused = async (path: string, method: string) => {
      const response = await proxy(request(path, method, viaPublic))
      expect(response.status, `${method} ${path}`).toBe(404)
      expect(await response.text(), `${method} ${path}`).toBe('Not Found')
      expect(response.headers.get('x-middleware-next'), `${method} ${path}`).toBeNull()
      expect(rewrite(response), `${method} ${path}`).toBeNull()
      expect(mark(response), `${method} ${path}`).toBeNull()
    }
    vi.stubEnv('SITE_STAGE', 'm2')
    for (const path of [...DRAFTS, '/en/jobs/', '/sitemaps/jobs.xml']) await refused(path, 'GET')
    // A page takes no POST through them, and no other method.
    await refused('/en/about/', 'POST')
    await refused('/en/about/', 'PUT')
    // What it holds public goes on as without the mark.
    const about = await proxy(request('/en/about/', 'GET', viaPublic))
    expect(rewrite(about)?.pathname).toBe('/m2/en/about/')
    expect(mark(about)).toBe(PUBLIC_MARK.value)
    // In the private stage it holds nothing public (Caddy and the app disagree: closed).
    vi.stubEnv('SITE_STAGE', 'private')
    for (const path of ['/en/', '/en/about/', '/robots.txt']) await refused(path, 'GET')
    // Without the mark (the password's handle, which removes a visitor's copy) nothing changes.
    expect((await proxy(request('/en/jobs/'))).headers.get('x-middleware-next')).toBe('1')
  })

  it('marks nothing in the private stage, or with a value that is not a stage', async () => {
    for (const value of ['', 'private', 'M2', 'm2 ']) {
      vi.stubEnv('SITE_STAGE', value)
      for (const path of [
        '/en/',
        '/en/about/',
        '/robots.txt',
        '/sitemap.xml',
        '/sitemaps/pages.xml',
      ]) {
        expect(mark(await proxy(request(path))), `${value}: ${path}`).toBeNull()
      }
    }
  })

  it('rewrites nothing in the private stage, or with a value that is not a stage', async () => {
    for (const value of ['', 'private', 'M2', 'public']) {
      vi.stubEnv('SITE_STAGE', value)
      for (const path of ['/en/', '/en/about/', '/en/newsletter/']) {
        const response = await proxy(request(path))
        expect(response.headers.get('x-middleware-next'), `${value}: ${path}`).toBe('1')
      }
    }
  })

  it('gives the M2 versions’ own addresses the 404 page, not stored, in every stage', async () => {
    for (const value of ['private', 'm2']) {
      vi.stubEnv('SITE_STAGE', value)
      for (const path of ['/m2/', '/m2/en/', '/m2/en/about/', '/m2/tr/iletisim/', '/m2/x/']) {
        for (const method of ['GET', 'POST']) {
          const response = await proxy(request(path, method))
          expect(response.status, `${value}: ${method} ${path}`).toBe(404)
          expect(rewrite(response)?.pathname, path).toBe('/_not-found')
          expect(response.headers.get('cache-control'), path).toBe('private, no-store')
        }
      }
    }
  })

  it('runs for the M2 versions’ addresses, robots.txt and the sitemap index too', async () => {
    const { config } = await import('./proxy')
    expect(config.matcher).toEqual(
      expect.arrayContaining(['/m2/:path*', '/robots.txt', '/sitemap.xml']),
    )
  })

  it('answers robots.txt and the sitemap index unchanged in the private stage', async () => {
    vi.stubEnv('SITE_STAGE', 'private')
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      const response = await proxy(request(path))
      expect(response.headers.get('x-middleware-next'), path).toBe('1')
      expect([...response.headers.keys()].sort(), path).toEqual(['x-middleware-next'])
    }
  })
})
