import { expect, test } from '@playwright/test'

import { CONTENT_PAGES } from '../../src/lib/content'

import { FIXED_JOBS, RETIRED_JOB, jobPath } from '../../src/scripts/fake-jobs-fixed'

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

  // Machine files (PLAN §2.2): they end in a file name, so they get no trailing slash.
  const machineFiles = [
    ['/robots.txt', 'text/plain'],
    ['/sitemap.xml', 'application/xml; charset=utf-8'],
    ['/sitemaps/pages.xml', 'application/xml; charset=utf-8'],
    ['/sitemaps/jobs.xml', 'application/xml; charset=utf-8'],
    ['/sitemaps/institutions.xml', 'application/xml; charset=utf-8'],
    ['/en/jobs/feed.xml', 'application/rss+xml; charset=utf-8'],
  ] as const
  for (const [path, type] of machineFiles) {
    test(`${path} answers 200 as ${type}, without a redirect`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain(type)
    })
  }

  for (const path of ['/sitemap.xml', '/sitemaps/jobs.xml', '/en/jobs/feed.xml']) {
    test(`${path}/ redirects permanently to the file`, async ({ request }) => {
      const response = await request.get(`${path}/`, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe(path)
    })
  }

  // Turkish pages are indexed once one of the Turkish texts is approved (draft: false).
  const turkishIndexed = Object.values(CONTENT_PAGES).some(
    (page) => page.locale === 'tr' && !page.draft,
  )
  for (const path of [
    // A type without pages: no hub has its introduction yet.
    '/sitemaps/subfields.xml',
    // Only when there are more than 50,000 jobs.
    '/sitemaps/jobs-3.xml',
    // Only once Turkish pages are indexed.
    ...(turkishIndexed ? [] : ['/sitemaps/pages-tr.xml']),
  ]) {
    test(`${path} answers 404, not stored`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(404)
      expect(response.headers()['cache-control']).toContain('no-store')
    })
  }

  test('/sitemaps/jobs-2.xml repeats the last job of jobs.xml, for an index read before jobs closed', async ({
    request,
  }) => {
    const locs = async (path: string) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(200)
      return [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    }
    const jobs = await locs('/sitemaps/jobs.xml')
    expect(jobs.length).toBeGreaterThan(0)
    expect(await locs('/sitemaps/jobs-2.xml')).toEqual(jobs.slice(-1))
  })

  // Names no sitemap file can have get the 404 page, like any unknown URL.
  for (const path of [
    '/sitemaps/',
    '/sitemaps/unknown.xml',
    '/sitemaps/wp-login.php',
    '/sitemaps/jobs-1.xml',
    '/sitemaps/foo/',
  ]) {
    test(`${path} is a server-rendered 404, not stored`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(404)
      expect(response.headers()['content-type']).toContain('text/html')
      expect(response.headers()['cache-control']).toContain('no-store')
      const html = await response.text()
      expect(html).toContain('<main id="main"')
      expect(html).toContain('Page not found')
    })
  }

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

  test('an institution page renders on the server', async ({ request }) => {
    const response = await request.get(CALTECH)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<h1>California Institute of Technology</h1>')
    expect(html).toContain('Pasadena, United States')
    expect(html).toContain('href="https://ror.org/05dxps055"')
    expect(html).toContain(`<link rel="canonical" href="https://gliagora.com${CALTECH}"`)
    // A deep page: breadcrumbs as structured data (PLAN §16.2).
    expect(html).toContain('"@type":"BreadcrumbList"')
  })

  test('an institution without open positions is not indexed (PLAN §2.5)', async ({ request }) => {
    // In the ROR test data, but no fake jobs are placed there.
    const response = await request.get('/en/institutions/037mpqg03/')
    expect(response.url()).toContain('/en/institutions/xstrata-united-kingdom-037mpqg03/')
    const html = await response.text()
    expect(html).toContain('There are no open positions here at the moment.')
    expect(html).toContain('<meta name="robots" content="noindex"')
  })

  test('an institution with an open position lists it and is indexed', async ({ request }) => {
    const response = await request.get(`/en/institutions/${FIXED_JOBS.open.institutionRorId}/`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`href="${jobPath(FIXED_JOBS.open)}"`)
    expect(html).not.toContain('There are no open positions here')
    expect(html).not.toContain('<meta name="robots" content="noindex"')
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

  test('institution redirects are not stored, since names can change back', async ({ request }) => {
    const response = await request.get('/en/institutions/05dxps055/', { maxRedirects: 0 })
    expect(response.headers()['cache-control']).toContain('no-store')
  })

  test('a subfield hub renders on the server, not indexed yet', async ({ request }) => {
    const response = await request.get('/en/subfields/glia/')
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('<h1>Glial biology</h1>')
    expect(html).toContain('href="/en/subfields/systems-circuits/"')
    expect(html).toContain('<meta name="robots" content="noindex"')
  })

  test('a subfield hub lists its open positions, and no closed ones', async ({ request }) => {
    const html = await (await request.get('/en/subfields/glia/')).text()
    expect(html).toContain(`href="${jobPath(FIXED_JOBS.open)}"`)
    const synapses = await (await request.get('/en/subfields/synapses-plasticity/')).text()
    expect(synapses).not.toContain(jobPath(FIXED_JOBS.expiredRecently))
  })

  test('the subfield index lists every subfield', async ({ request }) => {
    const html = await (await request.get('/en/subfields/')).text()
    expect(html.match(/href="\/en\/subfields\/[a-z-]+\/"/g)).toHaveLength(19)
  })
})

// Job pages and their lifecycle (PLAN §2.5, §3.2). Needs the fake jobs: pnpm fake:jobs.
test.describe('Job pages', () => {
  test.skip(({ isMobile }) => isMobile, 'HTTP checks do not depend on the device')

  const OPEN = jobPath(FIXED_JOBS.open)
  const CLOSED = jobPath(FIXED_JOBS.expiredRecently)
  const POSTING = (job: { institutionRorId: string; shortId: string }) =>
    `https://careers.example.org/${job.institutionRorId}/positions/${job.shortId}`

  test('an open job renders on the server, indexed, with its canonical URL', async ({
    request,
  }) => {
    const response = await request.get(OPEN)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(FIXED_JOBS.open.title)
    expect(html).toContain(`<link rel="canonical" href="https://gliagora.com${OPEN}"`)
    expect(html).not.toContain('<meta name="robots" content="noindex"')
    expect(html).toContain(`href="${POSTING(FIXED_JOBS.open)}"`)
    expect(html).toContain('View original posting')
    expect(html).not.toContain('This position has closed')
    // Facts only: breadcrumbs as structured data, never JobPosting (PLAN §16.2).
    expect(html).toContain('"@type":"BreadcrumbList"')
    expect(html).not.toContain('JobPosting')
    // Nothing internal reaches the page.
    expect(html).not.toContain('Fake data (pnpm fake:jobs)')
  })

  test('a closed job shows the notice, no way to apply, and is not indexed', async ({
    request,
  }) => {
    const response = await request.get(CLOSED)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain('This position has closed')
    expect(html).toContain('<meta name="robots" content="noindex"')
    expect(html).toContain(`<link rel="canonical" href="https://gliagora.com${CLOSED}"`)
    expect(html).not.toContain(POSTING(FIXED_JOBS.expiredRecently))
    // The similar open positions come before the facts of the closed one.
    expect(html.indexOf('Similar positions')).toBeLessThan(html.indexOf('Original language'))
  })

  for (const [name, job] of [
    ['closed more than 30 days ago', FIXED_JOBS.expiredLongAgo],
    ['withdrawn', FIXED_JOBS.withdrawn],
  ] as const) {
    test(`a job ${name} answers 410 with the removed-page`, async ({ request }) => {
      const response = await request.get(jobPath(job))
      expect(response.status()).toBe(410)
      expect(response.headers()['cache-control']).toContain('no-store')
      const html = await response.text()
      expect(html).toContain('Page removed')
      expect(html).toContain('<meta name="robots" content="noindex"')
      expect(html).not.toContain(job.title)
    })
  }

  // A job deleted 12 months after it went offline keeps only its address and ID (D34).
  for (const path of [jobPath(RETIRED_JOB), `/en/jobs/${RETIRED_JOB.shortId}/`]) {
    test(`a retired job (${path}) keeps answering 410 with the removed-page`, async ({
      request,
    }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(410)
      expect(response.headers()['cache-control']).toContain('no-store')
      const html = await response.text()
      expect(html).toContain('Page removed')
      expect(html).toContain('<meta name="robots" content="noindex"')
    })
  }

  for (const path of [
    jobPath(FIXED_JOBS.draft),
    // A draft is unknown without its slug too: no redirect gives its address away.
    `/en/jobs/${FIXED_JOBS.draft.shortId}/`,
    '/en/jobs/no-such-job-zzzzz/',
    '/en/jobs/PhD-test1/',
    '/en/jobs/phd/',
    // Names under /en/jobs/ that look like files and are not the feed.
    '/en/jobs/rss.xml',
  ]) {
    test(`${path} is a server-rendered 404`, async ({ request }) => {
      const response = await request.get(path)
      expect(response.status()).toBe(404)
      expect(response.headers()['cache-control']).toContain('no-store')
      const html = await response.text()
      expect(html).toContain('Page not found')
      expect(html).not.toContain(FIXED_JOBS.draft.title)
    })
  }

  test('an outdated slug redirects permanently to the current URL, keeping the query', async ({
    request,
  }) => {
    const response = await request.get(`/en/jobs/old-title-${FIXED_JOBS.open.shortId}/?a=1&b=2`, {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    const location = new URL(response.headers()['location']!, 'http://x')
    expect(location.pathname).toBe(OPEN)
    expect(location.search).toBe('?a=1&b=2')
  })

  test('a job URL without its slug redirects permanently to the current URL', async ({
    request,
  }) => {
    for (const job of [FIXED_JOBS.rolling, FIXED_JOBS.expiredRecently]) {
      const response = await request.get(`/en/jobs/${job.shortId}/`, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      expect(new URL(response.headers()['location']!, 'http://x').pathname).toBe(jobPath(job))
    }
  })

  test('job redirects are not kept by caches, since a title changed back would loop', async ({
    request,
  }) => {
    for (const path of [
      `/en/jobs/old-title-${FIXED_JOBS.open.shortId}/`,
      `/en/jobs/${FIXED_JOBS.open.shortId}/`,
    ]) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(308)
      expect(response.headers()['cache-control']).toContain('no-store')
    }
  })

  test('the jobs list the breadcrumbs and "all positions" links lead to answers 200', async ({
    request,
  }) => {
    // Canonical addresses (src/lib/filters): no redirect on the way.
    for (const path of ['/en/jobs/?type=phd', '/en/jobs/?subfield=glia&type=phd']) {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(200)
    }
  })
})
