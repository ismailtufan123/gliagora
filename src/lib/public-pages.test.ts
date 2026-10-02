import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { CONTENT_PAGES, type ContentKey } from './content'
import { contentPageIndexed, newsletterPageIndexed, newsletterSignupIndexed } from './indexing'
import { NEWSLETTER_PATHS } from './newsletter/paths'
import { M2_PREFIX, publicPathname } from './public-path'
import {
  type IsDraft,
  M2_PAGES,
  PUBLIC_ASSET_PREFIXES,
  indexedPublicPages,
  isPublicAddress,
  isPublicRequest,
  m2Twin,
  publicGetPaths,
  publicMachineFiles,
  publicPages,
  publicPostPaths,
} from './public-pages'
import { sitemapPath } from './seo/sitemap'
import { paths } from './site'

// The public pages of the M2 state (D41, D50): one list for Caddy, the proxy, the sitemaps,
// robots.txt and the links of the M2 versions.

const FRONTEND = fileURLToPath(new URL('../app/(frontend)/', import.meta.url))

/** The pages (or route handlers) under a folder of src/app/(frontend), as addresses. */
function routesUnder(folder: string, file: 'page.tsx' | 'route.ts'): string[] {
  const root = path.join(FRONTEND, folder)
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((name) => path.basename(name) === file)
    .map((name) => {
      const dir = path.dirname(name).split(path.sep).join('/')
      // Route groups such as (list) are not part of the address.
      const segments = dir === '.' ? [] : dir.split('/').filter((s) => !/^\(.*\)$/.test(s))
      return `/${[folder, ...segments].join('/')}/`.replace(/\/+/g, '/')
    })
}

/**
 * Today's approvals; the start of M2 (only About), with one more text or several approved; every
 * text approved. Tests that name what is public use these fixed worlds, not today's approvals,
 * so that approving a text (draft: false) needs no change here.
 */
const NOW: IsDraft = (key) => CONTENT_PAGES[key].draft
const ALL_APPROVED: IsDraft = () => false
const ONLY_ABOUT: IsDraft = (key) => key !== 'about'
const plus =
  (...approved: ContentKey[]): IsDraft =>
  (key) =>
    approved.includes(key) ? false : ONLY_ABOUT(key)

describe('the M2 pages (src/lib/public-pages.ts)', () => {
  it('are site addresses ending with a slash, each listed once', () => {
    for (const page of M2_PAGES) {
      expect(page.path, page.path).toMatch(/^\/(?:[a-z0-9-]+\/)*$/)
    }
    expect(new Set(M2_PAGES.map((page) => page.path)).size).toBe(M2_PAGES.length)
  })

  it('have their M2 version under src/app/(frontend)/m2/, and every M2 version is listed', () => {
    const twins = [...routesUnder('m2/en', 'page.tsx'), ...routesUnder('m2/tr', 'page.tsx')]
      .map((twin) => publicPathname(twin))
      .sort()
    const pages = M2_PAGES.filter((page) => page.kind === 'page')
      .map((page) => page.path)
      .sort()
    expect(twins, 'add the missing twins, or remove the extra ones').toEqual(pages)
    // Every twin repeats a page of the full site at the same address.
    for (const page of pages) {
      expect(existsSync(path.join(FRONTEND, page, 'page.tsx')), page).toBe(true)
    }
    // Only pages have twins: the M2 folder holds no route handler of its own.
    expect(routesUnder('m2', 'route.ts')).toEqual([])
  })

  it('name a route handler or the redirect of / for each route, which is never rewritten', () => {
    for (const route of M2_PAGES.filter((page) => page.kind === 'route')) {
      if (route.path === '/') continue
      expect(existsSync(path.join(FRONTEND, route.path, 'route.ts')), route.path).toBe(true)
      expect(m2Twin(route.path, ALL_APPROVED), route.path).toBeNull()
    }
  })

  it('take POSTs only on the forms and the routes behind their buttons', () => {
    expect(publicPostPaths(ALL_APPROVED)).toEqual([
      // The Glia Notes signup's Server Action, "Send it again", confirming and unsubscribing (also
      // the one-click POST of mail programs).
      '/en/newsletter',
      '/en/newsletter/',
      '/en/newsletter/resend',
      '/en/newsletter/resend/',
      '/en/newsletter/confirm/use',
      '/en/newsletter/confirm/use/',
      '/en/newsletter/unsubscribe/use',
      '/en/newsletter/unsubscribe/use/',
      '/en/legal/data-requests',
      '/en/legal/data-requests/',
      '/en/legal/data-requests/confirm/use',
      '/en/legal/data-requests/confirm/use/',
    ])
    expect(publicPostPaths(ONLY_ABOUT)).toEqual([])
  })

  it('make a text public only once it is approved, with the pages that belong to it', () => {
    expect(publicPages(ONLY_ABOUT).map((page) => page.path)).toEqual(['/', '/en/', '/en/about/'])
    expect(publicPages(plus('privacy')).map((page) => page.path)).toContain('/en/legal/privacy/')
    const withRequests = publicPages(plus('dataRequests')).map((page) => page.path)
    for (const after of ['sent/', 'confirm/', 'confirm/use/', 'done/', 'received/']) {
      expect(withRequests).toContain(`/en/legal/data-requests/${after}`)
    }
    // Glia Notes with the açık rıza metni, whose consent its signup records (D50); not with the
    // privacy texts alone.
    const withConsent = publicPages(plus('acikRiza')).map((page) => page.path)
    for (const path of Object.values(NEWSLETTER_PATHS)) {
      expect(withConsent, path).toContain(path)
      expect(publicPages(plus('privacy', 'kvkk')).map((page) => page.path)).not.toContain(path)
    }
    // Every text that may become public is in the list, and no draft is public now.
    for (const [key, page] of Object.entries(CONTENT_PAGES)) {
      expect(
        publicPages(ALL_APPROVED).map((one) => one.path),
        key,
      ).toContain(page.path)
      expect(
        publicPages(NOW).some((one) => one.path === page.path),
        key,
      ).toBe(!page.draft)
    }
  })

  it('index the coming-soon page, the Glia Notes signup and the approved texts, as their pages do', () => {
    expect(indexedPublicPages(ONLY_ABOUT).map((page) => page.path)).toEqual(['/en/', '/en/about/'])
    expect(indexedPublicPages(plus('acikRiza')).map((page) => page.path)).toEqual([
      '/en/',
      '/en/about/',
      '/en/newsletter/',
      '/tr/legal/acik-riza-metni/',
    ])
    for (const page of indexedPublicPages(ALL_APPROVED)) {
      const text = Object.values(CONTENT_PAGES).find((one) => one.path === page.path)
      if (text) expect(contentPageIndexed({ draft: false }), page.path).toBe(true)
      else if (page.path === NEWSLETTER_PATHS.signup) expect(newsletterSignupIndexed()).toBe(true)
      else expect(page.path).toBe('/en/')
    }
    // The pages after the signup never are.
    expect(newsletterPageIndexed()).toBe(false)
    expect(
      indexedPublicPages(ALL_APPROVED).filter((page) => page.path.startsWith('/en/newsletter/')),
    ).toEqual([expect.objectContaining({ path: NEWSLETTER_PATHS.signup })])
    // The pages after the data-request form never are.
    expect(
      indexedPublicPages(ALL_APPROVED).filter((page) => page.path.includes('/data-requests/')),
    ).toEqual([expect.objectContaining({ path: '/en/legal/data-requests/' })])
  })

  it('open the machine files of the sitemaps they need, Turkish only with a Turkish text', () => {
    expect(publicMachineFiles(ONLY_ABOUT)).toEqual([
      '/robots.txt',
      '/sitemap.xml',
      sitemapPath({ type: 'pages', locale: 'en', page: 1 }),
    ])
    expect(publicMachineFiles(plus('kvkk'))).toContain(
      sitemapPath({ type: 'pages', locale: 'tr', page: 1 }),
    )
    expect(publicMachineFiles(plus('privacy'))).not.toContain('/sitemaps/pages-tr.xml')
  })

  it('open each page with and without its slash, and nothing else', () => {
    expect(publicGetPaths(ONLY_ABOUT)).toEqual([
      '/',
      '/en',
      '/en/',
      '/en/about',
      '/en/about/',
      '/robots.txt',
      '/sitemap.xml',
      '/sitemaps/pages.xml',
    ])
    expect(PUBLIC_ASSET_PREFIXES).toEqual(['/_next/static/', '/brand/'])
  })

  it('never open the admin, the API, the basemap, the M2 versions or the private sections', () => {
    const paths = [...publicGetPaths(ALL_APPROVED), ...publicPostPaths(ALL_APPROVED)]
    for (const path of paths) {
      expect(path, path).not.toMatch(
        /^\/(?:admin|api|basemap|m2|health|map)(?:\/|$)|^\/en\/(?:jobs|map|search|suggest|report|sign-in|sign-out|account|institutions|subfields|events|learn)(?:\/|$)/,
      )
    }
    for (const address of [
      '/en/jobs/',
      '/en/suggest/',
      '/en/report/',
      '/en/search/?q=glia',
      '/en/account/',
      '/en/sign-in/',
      '/api/map/institutions/',
      '/basemap/current.json',
      '/admin',
      `${M2_PREFIX}/en/about/`,
      '/en/legal/privacy/',
      '/sitemaps/jobs.xml',
      '/en/about/x/',
      '/_next/image',
    ]) {
      expect(isPublicAddress(address, ONLY_ABOUT), address).toBe(false)
    }
  })

  it('read an address as Caddy does: its path only, the assets by prefix', () => {
    expect(isPublicAddress('/en/about/#team', ONLY_ABOUT)).toBe(true)
    expect(isPublicAddress('/en/?utm_source=x', ONLY_ABOUT)).toBe(true)
    expect(isPublicAddress('/_next/static/chunks/main.js', ONLY_ABOUT)).toBe(true)
    expect(isPublicAddress('/brand/favicon.svg', ONLY_ABOUT)).toBe(true)
    expect(isPublicAddress('/en/legal/privacy/', plus('privacy'))).toBe(true)
  })
})

describe('the Glia Notes addresses (src/lib/newsletter/paths.ts)', () => {
  it('lie under the section’s address, which the list names without importing the site’s paths', () => {
    expect(NEWSLETTER_PATHS.signup).toBe(paths.section('newsletter'))
    for (const path of Object.values(NEWSLETTER_PATHS)) {
      expect(path.startsWith(NEWSLETTER_PATHS.signup), path).toBe(true)
      expect(path.endsWith('/'), path).toBe(true)
    }
  })

  it('show their M2 versions for the pages, and never rewrite the routes', () => {
    for (const path of Object.values(NEWSLETTER_PATHS)) {
      const route = path.endsWith('/use/') || path === NEWSLETTER_PATHS.resend
      expect(m2Twin(path, plus('acikRiza')), path).toBe(route ? null : `${M2_PREFIX}${path}`)
      expect(m2Twin(path, ONLY_ABOUT), path).toBeNull()
    }
  })
})

describe('m2Twin', () => {
  it('names the M2 version of a public page, for its address with the slash only', () => {
    expect(m2Twin('/en/', ONLY_ABOUT)).toBe('/m2/en/')
    expect(m2Twin('/en/about/', ONLY_ABOUT)).toBe('/m2/en/about/')
    expect(m2Twin('/en/about', ONLY_ABOUT)).toBeNull()
    expect(m2Twin('/', ONLY_ABOUT)).toBeNull()
  })

  it('leaves texts that are not approved, and every private page, alone', () => {
    expect(m2Twin('/en/legal/privacy/', ONLY_ABOUT)).toBeNull()
    expect(m2Twin('/en/legal/privacy/', plus('privacy'))).toBe('/m2/en/legal/privacy/')
    expect(m2Twin('/tr/iletisim/', plus('iletisim'))).toBe('/m2/tr/iletisim/')
    for (const path of ['/en/jobs/', '/en/account/', '/en/legal/data-requests/confirm/use/']) {
      expect(m2Twin(path, ALL_APPROVED), path).toBeNull()
    }
  })
})

describe('publicPathname', () => {
  it('gives the address a visitor sees for an M2 version', () => {
    expect(publicPathname('/m2/en/about/')).toBe('/en/about/')
    expect(publicPathname('/m2/tr/iletisim/')).toBe('/tr/iletisim/')
    expect(publicPathname('/m2/')).toBe('/')
    expect(publicPathname('/m2')).toBe('/')
  })

  it('leaves every other address as it is', () => {
    for (const path of ['/en/about/', '/en/', '/', '/m2x/', '/en/m2/', '/m22/en/']) {
      expect(publicPathname(path), path).toBe(path)
    }
  })
})

describe('isPublicRequest', () => {
  it('opens the pages and machine files to GET and HEAD, the forms to POST, nothing else', () => {
    for (const method of ['GET', 'HEAD']) {
      for (const path of ['/en/', '/en/about/', '/robots.txt', '/sitemap.xml']) {
        expect(isPublicRequest(method, path, ONLY_ABOUT), `${method} ${path}`).toBe(true)
      }
    }
    expect(isPublicRequest('POST', '/en/about/', ONLY_ABOUT)).toBe(false)
    expect(isPublicRequest('PUT', '/en/about/', ONLY_ABOUT)).toBe(false)
    expect(isPublicRequest('GET', '/en/legal/privacy/', ONLY_ABOUT)).toBe(false)
    expect(isPublicRequest('GET', '/en/legal/privacy/', plus('privacy'))).toBe(true)
    expect(isPublicRequest('POST', '/en/legal/data-requests/', plus('dataRequests'))).toBe(true)
    expect(isPublicRequest('POST', '/en/legal/data-requests/confirm/use/', ONLY_ABOUT)).toBe(false)
    for (const path of ['/en/jobs/', '/m2/en/', '/_next/static/x.js', '/brand/favicon.svg']) {
      expect(isPublicRequest('GET', path, ALL_APPROVED), path).toBe(false)
    }
  })
})
