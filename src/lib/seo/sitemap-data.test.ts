import { afterEach, describe, expect, it, vi } from 'vitest'

const getPayload = vi.fn()
const subfieldsForIndexing = vi.fn()
vi.mock('payload', () => ({ getPayload }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/records', () => ({ subfieldsForIndexing }))

const { sitemapSource } = await import('./sitemap-data')
const { CONTENT_PAGES } = await import('@/lib/content')
const { indexedPublicPages } = await import('@/lib/public-pages')

afterEach(() => {
  vi.unstubAllEnvs()
  getPayload.mockReset()
  subfieldsForIndexing.mockReset()
})

// What the sitemaps read in each stage of the site (D41, D50). The private stage's queries are
// checked against the database end to end (tests/e2e/seo.spec.ts).
describe('sitemapSource', () => {
  const NOW = new Date('2026-10-02T12:00:00Z')

  it('in the M2 state lists only the public pages that are indexed, and reads no database', async () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    const source = sitemapSource(NOW)
    // The coming-soon page and the texts approved now (src/lib/content.ts).
    expect((await source.pages()).map((entry) => entry.path)).toEqual(
      indexedPublicPages().map((page) => page.path),
    )
    expect(indexedPublicPages().map((page) => page.path)).toEqual(
      expect.arrayContaining(['/en/', '/en/about/']),
    )
    expect(await source.jobs()).toEqual([])
    expect(await source.institutions()).toEqual([])
    expect(await source.subfields()).toEqual([])
    expect(getPayload).not.toHaveBeenCalled()
    expect(subfieldsForIndexing).not.toHaveBeenCalled()
  })

  it('in the private stage lists the full site’s pages, as before', async () => {
    vi.stubEnv('SITE_STAGE', 'private')
    subfieldsForIndexing.mockResolvedValue([])
    const pages = await sitemapSource(NOW).pages()
    expect(pages.map((entry) => entry.path)).toEqual([
      '/en/',
      '/en/jobs/',
      '/en/map/',
      '/en/suggest/',
      '/en/newsletter/',
      ...Object.values(CONTENT_PAGES)
        .filter((page) => !page.draft)
        .map((page) => page.path),
    ])
  })
})
