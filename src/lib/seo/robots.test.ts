import { resolveRobots } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
import { afterEach, describe, expect, it, vi } from 'vitest'

import robots from '@/app/robots'
import { SUBFIELDS_PATH, institutionPath, jobPath, subfieldPath } from '@/lib/detail-routes'
import { CONTENT_PAGES } from '@/lib/content'
import { indexedPublicPages, isPublicAddress, publicMachineFiles } from '@/lib/public-pages'

import { FEED_PATH, jobPermalink } from './feed'
import {
  DISALLOW,
  disallowRules,
  exactlyAllowed,
  isDisallowed,
  robotsRuleMatches,
  robotsRules,
} from './robots'
import { m2PageEntries, pageEntries } from './sitemap-entries'

describe('robotsRuleMatches', () => {
  it('reads a rule as a prefix of the path', () => {
    expect(robotsRuleMatches('/admin', '/admin')).toBe(true)
    expect(robotsRuleMatches('/admin', '/admin/collections/jobs')).toBe(true)
    expect(robotsRuleMatches('/admin', '/en/admin')).toBe(false)
    expect(robotsRuleMatches('/en/search/', '/en/search/?q=glia')).toBe(true)
    expect(robotsRuleMatches('/en/search/', '/en/search')).toBe(false)
  })

  it('reads * as any characters and a final $ as the end of the path', () => {
    expect(robotsRuleMatches('/*?', '/en/jobs/?type=phd')).toBe(true)
    expect(robotsRuleMatches('/*?', '/en/jobs/')).toBe(false)
    expect(robotsRuleMatches('/*.xml$', '/sitemaps/jobs.xml')).toBe(true)
    expect(robotsRuleMatches('/*.xml$', '/sitemaps/jobs.xml?x=1')).toBe(false)
  })

  it('takes other characters literally', () => {
    expect(robotsRuleMatches('/a.b', '/axb')).toBe(false)
    expect(robotsRuleMatches('/a+(b)', '/a+(b)/c')).toBe(true)
  })
})

describe('robots.txt', () => {
  const text = resolveRobots(robots())

  it('keeps crawlers out of the admin, the API, search, sign-in, the account and addresses with a query', () => {
    expect(text).toBe(
      [
        'User-Agent: *',
        'Disallow: /admin',
        'Disallow: /api',
        'Disallow: /en/search/',
        'Disallow: /en/sign-in/',
        'Disallow: /en/sign-out/',
        'Disallow: /en/account/',
        'Disallow: /*?',
        '',
        'Sitemap: https://gliagora.com/sitemap.xml',
        '',
      ].join('\n'),
    )
    expect(disallowRules(text)).toEqual([...DISALLOW])
  })

  it.each([
    '/admin',
    '/admin/collections/jobs',
    '/api/jobs',
    '/api/graphql',
    '/en/search/',
    '/en/search/?q=astrocytes',
    '/en/sign-in/',
    '/en/sign-in/link/',
    '/en/sign-out/',
    '/en/account/',
    '/en/jobs/?type=phd',
    '/en/jobs/?page=2',
    '/en/jobs/?view=map',
    '/en/institutions/karolinska-institutet-056d84691/?utm_source=newsletter',
  ])('disallows %s', (path) => {
    expect(isDisallowed(path)).toBe(true)
  })

  it('allows every kind of page the sitemaps list, the machine files and the assets', () => {
    // An indexed hub: its introduction has 150 words (D40).
    const hub = { id: 1, slug: 'glia', hubIntro: 'Glia are … '.repeat(75), updatedAt: '' }
    const paths = [
      ...pageEntries([hub]).map((entry) => entry.path),
      SUBFIELDS_PATH,
      jobPath('phd-position-in-astrocyte-neuron-signalling', 'test1'),
      institutionPath('karolinska-institutet', '056d84691'),
      subfieldPath('glia'),
      '/sitemap.xml',
      '/sitemaps/jobs.xml',
      '/sitemaps/jobs-2.xml',
      FEED_PATH,
      jobPermalink('test1'),
      '/brand/favicon.svg',
      '/_next/static/chunks/main.js',
    ]
    for (const path of paths) expect(isDisallowed(path), path).toBe(false)
  })
})

describe('disallowRules', () => {
  it('reads only the group for every crawler, ignoring comments', () => {
    expect(
      disallowRules(
        [
          '# comment',
          'User-agent: Googlebot',
          'Disallow: /only-google',
          '',
          'User-agent: Bingbot',
          'User-agent: *',
          'Disallow: /private # why',
          'Allow: /private/open',
          '',
          'User-agent: Other',
          'Disallow: /other',
        ].join('\n'),
      ),
    ).toEqual(['/private'])
  })
})

describe('isDisallowed with Allow rules (RFC 9309)', () => {
  const rules = {
    allow: ['/en/$', '/en/about/$', '/_next/static/'],
    disallow: ['/', '/en/private/'],
  }

  it('lets the longest matching rule decide', () => {
    expect(isDisallowed('/en/', rules)).toBe(false)
    expect(isDisallowed('/en/about/', rules)).toBe(false)
    expect(isDisallowed('/_next/static/chunks/a.js', rules)).toBe(false)
    expect(isDisallowed('/en/jobs/', rules)).toBe(true)
    expect(isDisallowed('/en/private/', rules)).toBe(true)
    // `$`: the exact address only, not with a query string or below it.
    expect(isDisallowed('/en/?utm_source=x', rules)).toBe(true)
    expect(isDisallowed('/en/about/team/', rules)).toBe(true)
  })

  it('gives a tie to the Allow rule', () => {
    expect(isDisallowed('/a', { allow: ['/a'], disallow: ['/a'] })).toBe(false)
    expect(isDisallowed('/ab', { allow: ['/a'], disallow: ['/ab'] })).toBe(true)
  })

  it('reads an empty Disallow rule as allowing everything', () => {
    expect(isDisallowed('/x', { allow: [], disallow: [''] })).toBe(false)
  })

  it('reads both kinds of rules for every crawler from a robots.txt text', () => {
    expect(
      robotsRules(
        [
          'User-agent: Googlebot',
          'Allow: /g',
          '',
          'User-agent: *',
          'Allow: /a$',
          'Disallow: /',
        ].join('\n'),
      ),
    ).toEqual({ allow: ['/a$'], disallow: ['/'] })
    expect(exactlyAllowed(['/en/'], ['/brand/'])).toEqual({
      allow: ['/en/$', '/brand/'],
      disallow: ['/'],
    })
  })
})

describe('robots.txt in the M2 state (D41, D50)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('disallows everything but the public pages that are indexed, the sitemaps and the assets', () => {
    vi.stubEnv('SITE_STAGE', 'm2')
    const text = resolveRobots(robots())
    // With the approvals of now (src/lib/content.ts): with only About, the pages are /en/ and
    // /en/about/, and the sitemap files /sitemap.xml and /sitemaps/pages.xml.
    expect(text).toBe(
      [
        'User-Agent: *',
        'Allow: /$',
        ...indexedPublicPages().map((page) => `Allow: ${page.path}$`),
        ...publicMachineFiles()
          .filter((file) => file !== '/robots.txt')
          .map((file) => `Allow: ${file}$`),
        'Allow: /_next/static/',
        'Allow: /brand/',
        'Allow: /hero/',
        'Disallow: /',
        '',
        'Sitemap: https://gliagora.com/sitemap.xml',
        '',
      ].join('\n'),
    )
    expect(text).toContain('Allow: /en/$\nAllow: /en/about/$\n')
    const rules = robotsRules(text)
    // Every page of the M2 sitemaps may be crawled, and only public addresses may. (Crawlers read
    // robots.txt itself in any case.)
    const files = publicMachineFiles().filter((file) => file !== '/robots.txt')
    for (const path of ['/', ...m2PageEntries().map((entry) => entry.path), ...files]) {
      expect(isDisallowed(path, rules), path).toBe(false)
    }
    // Texts not approved yet, the private pages and the public pages that are not indexed.
    const drafts = Object.values(CONTENT_PAGES)
      .filter((page) => page.draft)
      .map((page) => page.path)
    for (const path of [
      ...drafts,
      '/en/jobs/',
      '/en/suggest/',
      // A page after the Glia Notes signup (the signup itself is indexed once it is public).
      '/en/newsletter/check-your-inbox/',
      '/en/?utm_source=x',
      '/api/map/institutions/',
      '/sitemaps/jobs.xml',
      '/m2/en/',
    ]) {
      expect(isDisallowed(path, rules), path).toBe(true)
    }
    for (const rule of rules.allow) {
      const path = rule.replace(/\$$/, '')
      expect(isPublicAddress(`${path}x.js`) || isPublicAddress(path), rule).toBe(true)
    }
  })

  it('is the full site’s in the private stage, and with a value that is not a stage', () => {
    for (const value of ['', 'private', 'launch']) {
      vi.stubEnv('SITE_STAGE', value)
      expect(robotsRules(resolveRobots(robots()))).toEqual({ allow: [], disallow: [...DISALLOW] })
    }
  })
})
