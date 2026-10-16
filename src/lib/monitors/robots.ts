import { type Fetcher, FetchProblem, MAX_CRAWL_DELAY_S, PRODUCT_TOKEN } from './http'

// robots.txt (RFC 9309), read before every run (D52). The rules of the groups that name the
// monitor (`Gliagora-Monitor`, or `Gliagora`) apply, else those of `*`; the longest matching rule
// wins, and an allow wins a tie. A robots.txt that does not exist (an answer 4xx) allows
// everything; one that cannot be read (5xx, no answer) allows nothing, as the RFC says.
// Crawl-delay is not in the RFC but is honoured as a longer pause between requests.

type Rule = { allow: boolean; pattern: string }

export type RobotsRules = { rules: Rule[]; crawlDelay: number | null }

export type RobotsAnswer =
  | { state: 'rules'; rules: RobotsRules }
  | { state: 'allow-all' }
  | { state: 'disallow-all'; reason: string }

const MAX_ROBOTS_BYTES = 500 * 1024

const OUR_AGENTS = new Set([PRODUCT_TOKEN.toLowerCase(), 'gliagora'])

/** The rules of a robots.txt for the monitor. */
export function parseRobots(text: string): RobotsRules {
  type Group = { agents: string[]; rules: Rule[]; crawlDelay: number | null }
  const groups: Group[] = []
  let current: Group | null = null
  let inAgents = false
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      if (!current || !inAgents) {
        current = { agents: [], rules: [], crawlDelay: null }
        groups.push(current)
      }
      // "Gliagora-Monitor/1.0" names the product token.
      current.agents.push(value.toLowerCase().split('/')[0]!.trim())
      inAgents = true
      continue
    }
    if (!current) continue
    inAgents = false
    if (key === 'allow' || key === 'disallow') {
      // An empty disallow allows everything: no rule.
      if (value !== '') current.rules.push({ allow: key === 'allow', pattern: value })
    } else if (key === 'crawl-delay') {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.crawlDelay = Math.max(current.crawlDelay ?? 0, seconds)
      }
    }
  }
  const ours = groups.filter((group) => group.agents.some((agent) => OUR_AGENTS.has(agent)))
  const chosen = ours.length > 0 ? ours : groups.filter((group) => group.agents.includes('*'))
  const delays = chosen.map((group) => group.crawlDelay).filter((d): d is number => d !== null)
  return {
    rules: chosen.flatMap((group) => group.rules),
    crawlDelay: delays.length > 0 ? Math.max(...delays) : null,
  }
}

/** Percent-escapes in upper case, other characters as a browser sends them, for comparing paths. */
function normalisePath(value: string): string {
  return value.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase())
}

/** Whether a rule's pattern (with `*` and a final `$`) matches the start of `path`. */
function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = normalisePath(anchored ? pattern.slice(0, -1) : pattern)
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path)
}

/** Whether `url` may be read under `rules`. */
export function isAllowed(rules: RobotsRules, url: URL): boolean {
  const path = normalisePath(`${url.pathname}${url.search}`)
  let best: Rule | null = null
  for (const rule of rules.rules) {
    if (!patternMatches(rule.pattern, path)) continue
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule
    }
  }
  return best?.allow ?? true
}

/** What a run knows about each host's robots.txt: read once per host and run. */
export class RobotsCache {
  private readonly answers = new Map<string, Promise<RobotsAnswer>>()

  constructor(private readonly fetcher: Fetcher) {}

  /** The answer for `url`'s host. */
  answerFor(url: URL): Promise<RobotsAnswer> {
    const origin = url.origin
    let answer = this.answers.get(origin)
    if (!answer) {
      answer = this.read(url)
      this.answers.set(origin, answer)
    }
    return answer
  }

  /** Whether the monitor may read `url`. */
  async allows(url: URL): Promise<boolean> {
    const answer = await this.answerFor(url)
    if (answer.state === 'allow-all') return true
    if (answer.state === 'disallow-all') return false
    return isAllowed(answer.rules, url)
  }

  private async read(url: URL): Promise<RobotsAnswer> {
    const robots = new URL('/robots.txt', url.origin)
    try {
      const fetched = await this.fetcher.get(robots.toString(), {
        accept: 'text/plain',
        maxBytes: MAX_ROBOTS_BYTES,
      })
      const rules = parseRobots(fetched.text)
      if (rules.crawlDelay !== null) {
        if (rules.crawlDelay > MAX_CRAWL_DELAY_S) {
          return {
            state: 'disallow-all',
            reason: `asks for ${rules.crawlDelay} s between requests`,
          }
        }
        this.fetcher.slowDown(url.host, rules.crawlDelay)
      }
      return { state: 'rules', rules }
    } catch (error) {
      if (error instanceof FetchProblem && error.kind === 'status' && error.status! < 500) {
        return { state: 'allow-all' }
      }
      if (error instanceof FetchProblem && error.kind === 'too-large') {
        // RFC 9309: a crawler may stop at 500 KiB; we read nothing then rather than half the rules.
        return { state: 'disallow-all', reason: 'robots.txt is too large to read' }
      }
      const what = error instanceof FetchProblem ? error.message : 'unreadable'
      return { state: 'disallow-all', reason: `robots.txt could not be read (${what})` }
    }
  }
}
