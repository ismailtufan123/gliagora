import { resolveRobots } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
import { describe, expect, it } from 'vitest'

import robots from '@/app/robots'
import { SUBFIELDS_PATH, institutionPath, jobPath, subfieldPath } from '@/lib/detail-routes'

import { FEED_PATH, jobPermalink } from './feed'
import { DISALLOW, disallowRules, isDisallowed, robotsRuleMatches } from './robots'
import { pageEntries } from './sitemap-entries'

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
