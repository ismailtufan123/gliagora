import { expect, test } from '@playwright/test'

// PLAN §2.1 and §2.5: locale prefix, trailing slashes, redirects and status codes.
test.describe('HTTP behaviour', () => {
  test.skip(({ isMobile }) => isMobile, 'HTTP checks do not depend on the device')

  const redirects = [
    ['/', '/en/'],
    ['/en', '/en/'],
    ['/en/contact', '/en/contact/'],
  ] as const
  for (const [from, to] of redirects) {
    test(`${from} redirects permanently to ${to}`, async ({ request }) => {
      const response = await request.get(from, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe(to)
    })
  }

  for (const path of [
    '/tr/',
    '/tr/contact/',
    '/en/iletisim/',
    '/de/',
    '/en/unknown/',
    '/wp-admin/',
  ]) {
    test(`${path} is a server-rendered 404`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(404)
      const html = await response.text()
      expect(html).toContain('<main id="main"')
      expect(html).toContain('<meta name="robots" content="noindex"')
    })
  }

  test('a removed URL answers 410 with a server-rendered page', async ({ request }) => {
    const response = await request.get('/en/gone-example/')
    expect(response.status()).toBe(410)
    const html = await response.text()
    expect(html).toContain('<main id="main"')
    expect(html).toContain('Page removed')
    expect(html).toContain('<meta name="robots" content="noindex"')
  })

  test('the removed-page itself is not reachable: it is the server-rendered 404', async ({
    request,
  }) => {
    const response = await request.get('/en/gone/')
    expect(response.status()).toBe(404)
    const html = await response.text()
    expect(html).toContain('<main id="main"')
    expect(html).toContain('Page not found')
    expect(html).not.toContain('Page removed')
    expect(html).toContain('<meta name="robots" content="noindex"')
  })

  test('pages declare their language', async ({ request }) => {
    expect(await (await request.get('/en/contact/')).text()).toContain('<html lang="en"')
    expect(await (await request.get('/tr/iletisim/')).text()).toContain('<html lang="tr"')
  })

  test('the health check reports the database', async ({ request }) => {
    const response = await request.get('/health/')
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})

// Pages of database records (src/lib/detail-routes.ts). Needs the ROR test data that CI loads.
test.describe('Record pages', () => {
  test.skip(({ isMobile }) => isMobile, 'HTTP checks do not depend on the device')

  const CALTECH = '/en/institutions/california-institute-of-technology-05dxps055/'

  test('an institution page renders on the server, not indexed while it has no items', async ({
    request,
  }) => {
    const response = await request.get(CALTECH)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<h1>California Institute of Technology</h1>')
    expect(html).toContain('Pasadena, United States')
    expect(html).toContain('href="https://ror.org/05dxps055"')
    expect(html).toContain('<meta name="robots" content="noindex"')
    expect(html).toContain(`<link rel="canonical" href="https://gliagora.com${CALTECH}"`)
  })

  for (const path of ['/en/institutions/05dxps055/', '/en/institutions/caltech-05dxps055/']) {
    test(`${path} redirects permanently to the current URL`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      const location = new URL(response.headers()['location']!, 'http://x')
      expect(location.pathname).toBe(CALTECH)
    })
  }

  test('a redirect keeps the query string', async ({ request }) => {
    const response = await request.get('/en/institutions/caltech-05dxps055/?view=map', {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    expect(new URL(response.headers()['location']!, 'http://x').search).toBe('?view=map')
  })

  for (const path of [
    '/en/institutions/nowhere-000000000/',
    '/en/institutions/California-Institute-05dxps055/',
    '/en/institutions/',
    '/en/subfields/astrology/',
    '/en/subfields/Glia/',
    // Next.js leaves the trailing slash off segments that look like file names.
    '/en/subfields/wp-login.php',
    '/en/institutions/caltech-05dxps055.html',
  ]) {
    test(`${path} is a server-rendered 404`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(404)
      const html = await response.text()
      expect(html).toContain('<main id="main"')
      expect(html).toContain('Page not found')
    })
  }

  test('record 404s are not kept by caches, since the record may appear later', async ({
    request,
  }) => {
    const response = await request.get('/en/institutions/nowhere-000000000/')
    expect(response.headers()['cache-control']).toContain('no-store')
  })

  test('record redirects are cached for a day at most, since names can change back', async ({
    request,
  }) => {
    const response = await request.get('/en/institutions/05dxps055/', { maxRedirects: 0 })
    expect(response.headers()['cache-control']).toBe('public, max-age=86400')
  })

  test('a subfield hub renders on the server, not indexed yet', async ({ request }) => {
    const response = await request.get('/en/subfields/glia/')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<h1>Glial biology</h1>')
    expect(html).toContain('href="/en/subfields/systems-circuits/"')
    expect(html).toContain('<meta name="robots" content="noindex"')
  })

  test('the subfield index lists every subfield', async ({ request }) => {
    const html = await (await request.get('/en/subfields/')).text()
    expect(html.match(/href="\/en\/subfields\/[a-z-]+\/"/g)).toHaveLength(19)
  })
})
