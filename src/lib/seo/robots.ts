// robots.txt (PLAN §2.2, §16.1): everything public may be crawled, except the admin, the API,
// search results, sign-in and the account pages, and addresses with a query string.
// src/app/robots.ts writes these rules; the tests check that no page in the sitemaps is among them.
// No imports, so the end-to-end tests can load this file as it is.

/**
 * What crawlers are asked to leave alone: the admin, the API, search results (M4.9), sign-in,
 * sign-out and the account pages (M4b: each is about one visitor, and never indexed) and every
 * address with a query string, such as filtered and later pages of a list. Those pages point to the
 * unfiltered list as their canonical page, and every page worth indexing is in the sitemaps and
 * names its own canonical address, so crawlers need no query string to find anything. The `*`
 * wildcard is understood by Google and Bing.
 */
export const DISALLOW = [
  '/admin',
  '/api',
  '/en/search/',
  '/en/sign-in/',
  '/en/sign-out/',
  '/en/account/',
  '/*?',
] as const

const escapeRegExp = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a robots.txt path rule matches a path (with its query string), as Google and Bing read
 * it: the rule is a prefix of the path, `*` stands for any characters, and a final `$` marks the
 * end of the path.
 */
export function robotsRuleMatches(rule: string, path: string): boolean {
  const anchored = rule.endsWith('$')
  const body = anchored ? rule.slice(0, -1) : rule
  const pattern = body.split('*').map(escapeRegExp).join('.*')
  return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path)
}

/** Whether a Disallow rule keeps crawlers away from a path (there are no Allow rules). */
export const isDisallowed = (path: string, rules: readonly string[] = DISALLOW) =>
  rules.some((rule) => rule !== '' && robotsRuleMatches(rule, path))

/** The Disallow rules for every crawler (`User-agent: *`) in a robots.txt text. */
export function disallowRules(robotsTxt: string): string[] {
  const rules: string[] = []
  let forAll = false
  let inAgents = false
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!match) continue
    const [, field = '', value = ''] = match
    const name = field.toLowerCase()
    if (name === 'user-agent') {
      // Consecutive User-agent lines open one group.
      forAll = (inAgents && forAll) || value === '*'
      inAgents = true
      continue
    }
    inAgents = false
    if (forAll && name === 'disallow') rules.push(value)
  }
  return rules
}
