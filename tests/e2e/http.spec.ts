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
