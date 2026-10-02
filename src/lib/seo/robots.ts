// robots.txt (PLAN §2.2, §16.1): everything public may be crawled, except the admin, the API,
// search results, sign-in and the account pages, and addresses with a query string. In the M2
// state (D41, D50) only its public pages may be crawled (`exactlyAllowed`).
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

/** The rules of one group of robots.txt: Allow and Disallow lines. */
export type RobotsRules = { allow: readonly string[]; disallow: readonly string[] }

/**
 * The rules of the M2 state (D41, D50): every path is disallowed except the ones given, each
 * exactly (`$`, so not with a query string either), and the files under the prefixes given (the
 * scripts, styles and fonts crawlers need to render a page).
 */
export function exactlyAllowed(
  paths: readonly string[],
  prefixes: readonly string[] = [],
): RobotsRules {
  return { allow: [...paths.map((path) => `${path}$`), ...prefixes], disallow: ['/'] }
}

/** The length of the longest rule that matches a path, or -1 (an empty rule matches nothing). */
const longestMatch = (rules: readonly string[], path: string) =>
  Math.max(
    -1,
    ...rules
      .filter((rule) => rule !== '' && robotsRuleMatches(rule, path))
      .map((rule) => rule.length),
  )

/**
 * Whether the rules keep crawlers away from a path, as RFC 9309 says and Google and Bing do: the
 * longest matching rule decides, and an Allow rule wins a tie with a Disallow rule. Without Allow
 * rules: whether any Disallow rule matches.
 */
export function isDisallowed(
  path: string,
  rules: readonly string[] | RobotsRules = DISALLOW,
): boolean {
  const { allow, disallow } =
    'disallow' in rules ? rules : { allow: [], disallow: rules as readonly string[] }
  const disallowed = longestMatch(disallow, path)
  return disallowed >= 0 && disallowed > longestMatch(allow, path)
}

/** The Allow and Disallow rules for every crawler (`User-agent: *`) in a robots.txt text. */
export function robotsRules(robotsTxt: string): { allow: string[]; disallow: string[] } {
  const rules = { allow: [] as string[], disallow: [] as string[] }
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
    if (forAll && (name === 'allow' || name === 'disallow')) rules[name].push(value)
  }
  return rules
}

/** The Disallow rules for every crawler (`User-agent: *`) in a robots.txt text. */
export const disallowRules = (robotsTxt: string): string[] => robotsRules(robotsTxt).disallow
