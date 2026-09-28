import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { proxy } from './proxy'

// The canonical redirect of filtered lists (PLAN §2.1, §2.4). Record pages need the database and
// are checked end to end (tests/e2e/http.spec.ts).
const request = (path: string, method = 'GET') =>
  new NextRequest(new URL(path, 'http://localhost:3000'), { method })

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
