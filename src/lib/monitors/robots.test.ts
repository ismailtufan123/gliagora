import { describe, expect, it } from 'vitest'

import { type Fetcher, FetchProblem } from './http'
import { RobotsCache, isAllowed, parseRobots } from './robots'

const allowed = (robots: string, path: string) =>
  isAllowed(parseRobots(robots), new URL(path, 'https://www.example.org'))

describe('parseRobots and isAllowed (RFC 9309)', () => {
  it('uses the group for everyone when none names the monitor', () => {
    const robots = 'User-agent: *\nDisallow: /admin/\nDisallow: /search\n'
    expect(allowed(robots, '/jobs/123')).toBe(true)
    expect(allowed(robots, '/admin/x')).toBe(false)
    expect(allowed(robots, '/search?q=x')).toBe(false)
  })

  it('uses only the groups that name the monitor when there are some', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: Gliagora-Monitor',
      'Allow: /jobs/',
      'Disallow: /',
    ].join('\n')
    expect(allowed(robots, '/jobs/1')).toBe(true)
    expect(allowed(robots, '/news/')).toBe(false)
    expect(
      allowed('User-agent: gliagora\nDisallow: /jobs/\n\nUser-agent: *\nAllow: /\n', '/jobs/1'),
    ).toBe(false)
  })

  it('takes the longest matching rule, and an allow on a tie', () => {
    const robots = 'User-agent: *\nDisallow: /jobs\nAllow: /jobs/open/\nAllow: /x\nDisallow: /x\n'
    expect(allowed(robots, '/jobs/closed/1')).toBe(false)
    expect(allowed(robots, '/jobs/open/1')).toBe(true)
    expect(allowed(robots, '/x')).toBe(true)
  })

  it('reads * and $ in patterns', () => {
    const robots = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?sessionid=\n'
    expect(allowed(robots, '/files/ad.pdf')).toBe(false)
    expect(allowed(robots, '/files/ad.pdf?x=1')).toBe(true)
    expect(allowed(robots, '/jobs/?sessionid=1')).toBe(false)
  })

  it('shares rules between user agents listed together, ignores comments and an empty disallow', () => {
    const robots =
      'User-agent: Googlebot\nUser-agent: * # everyone\nDisallow:\nDisallow: /private\n'
    expect(allowed(robots, '/anything')).toBe(true)
    expect(allowed(robots, '/private/x')).toBe(false)
  })

  it('reads the largest Crawl-delay of the groups that apply', () => {
    expect(parseRobots('User-agent: *\nCrawl-delay: 5\nDisallow: /x\n').crawlDelay).toBe(5)
    expect(parseRobots('User-agent: *\nDisallow: /x\n').crawlDelay).toBeNull()
  })
})

function fetcherAnswering(
  answer: () => Promise<string>,
): Fetcher & { slowedDown: Array<[string, number]> } {
  const slowedDown: Array<[string, number]> = []
  return {
    slowedDown,
    get: async (url) => ({
      url,
      status: 200,
      contentType: 'text/plain',
      text: await answer(),
      tdmReserved: false,
    }),
    slowDown: (host, seconds) => slowedDown.push([host, seconds]),
  }
}

describe('RobotsCache', () => {
  const page = new URL('https://www.example.org/jobs/1')

  it('allows everything when robots.txt does not exist', async () => {
    const cache = new RobotsCache(
      fetcherAnswering(() => Promise.reject(new FetchProblem('status', 404))),
    )
    expect(await cache.allows(page)).toBe(true)
  })

  it('allows nothing when robots.txt cannot be read', async () => {
    for (const problem of [new FetchProblem('status', 503), new FetchProblem('timeout')]) {
      const cache = new RobotsCache(fetcherAnswering(() => Promise.reject(problem)))
      expect(await cache.allows(page)).toBe(false)
      expect(await cache.answerFor(page)).toMatchObject({ state: 'disallow-all' })
    }
  })

  it('reads robots.txt once per host, and passes on its Crawl-delay', async () => {
    let reads = 0
    const fetcher = fetcherAnswering(async () => {
      reads++
      return 'User-agent: *\nCrawl-delay: 10\nDisallow: /private/\n'
    })
    const cache = new RobotsCache(fetcher)
    expect(await cache.allows(page)).toBe(true)
    expect(await cache.allows(new URL('https://www.example.org/private/x'))).toBe(false)
    expect(reads).toBe(1)
    expect(fetcher.slowedDown).toEqual([['www.example.org', 10]])
  })

  it('reads nothing from a host that asks for more than a minute between requests', async () => {
    const cache = new RobotsCache(fetcherAnswering(async () => 'User-agent: *\nCrawl-delay: 120\n'))
    expect(await cache.allows(page)).toBe(false)
  })
})
