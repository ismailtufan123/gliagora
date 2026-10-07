// The rate limits of the production Caddyfile (deploy/Caddyfile, `(rate_limits)`; PLAN §18.2,
// D42), read from the file itself, so that the tests send as many requests as it allows and a
// changed limit needs no second number here. tests/caddy/limits.test.ts checks what the file says;
// tests/e2e/rate-limits.spec.ts sends the requests. Node's modules only, like serve.ts.
import { readFileSync } from 'node:fs'

import { CADDYFILE } from './serve'

/** One `match` block of a zone: every line must hold (the paths are alternatives). */
export type ZoneMatch = { methods: string[]; paths: string[]; expression: string | null }

export type Zone = {
  name: string
  /** The requests one visitor address may send within `window`. */
  events: number
  window: string
  /** What is counted apart: the visitor's address. */
  key: string
  /** IPv6 addresses count by this prefix (one network), or null: each on its own. */
  ipv6Prefix: number | null
  /** A request is counted when one of these matches. */
  matches: ZoneMatch[]
}

/** The text between the braces that open at `open` (the index of a `{`), braces balanced. */
function block(text: string, open: number): string {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === '{') depth++
    else if (text[index] === '}' && --depth === 0) return text.slice(open + 1, index)
  }
  throw new Error('Unbalanced braces in the Caddyfile')
}

/** Every `name {` block directly in a text, with what its line says before the brace. */
function blocks(text: string, name: string): { label: string; body: string }[] {
  const found: { label: string; body: string }[] = []
  const start = new RegExp(`^\\s*${name}\\b([^\\n{]*)\\{[ \\t]*$`, 'gm')
  for (const match of text.matchAll(start)) {
    const open = match.index + match[0].lastIndexOf('{')
    found.push({ label: (match[1] ?? '').trim(), body: block(text, open) })
  }
  return found
}

/** What follows a directive on its line, for each line that has it. */
const lines = (text: string, directive: string): string[] =>
  [...text.matchAll(new RegExp(`^\\s*${directive}\\s+(.+)$`, 'gm'))].map((match) =>
    (match[1] ?? '').trim(),
  )

const words = (text: string, directive: string): string[] =>
  lines(text, directive).flatMap((line) => line.split(/\s+/))

/** The zones of the Caddyfile's rate limits. */
export function rateLimitZones(caddyfile: string = readFileSync(CADDYFILE, 'utf8')): Zone[] {
  const [limiter, ...more] = blocks(caddyfile, 'rate_limit')
  if (!limiter || more.length > 0) throw new Error('Expected one rate_limit block')
  return blocks(limiter.body, 'zone').map(({ label, body }) => {
    const matches = blocks(body, 'match').map(({ body: match }) => ({
      methods: words(match, 'method'),
      paths: words(match, 'path'),
      expression: lines(match, 'expression')[0] ?? null,
    }))
    // What the zone says outside its match blocks.
    const own = blocks(body, 'match').reduce(
      (rest, { body: match }) => rest.replace(match, ''),
      body,
    )
    const one = (directive: string) => words(own, directive)[0]
    const prefix = one('ipv6_prefix')
    return {
      name: label,
      events: Number(one('events')),
      window: one('window') ?? '',
      key: one('key') ?? '',
      ipv6Prefix: prefix === undefined ? null : Number(prefix),
      matches,
    }
  })
}

/** A zone by its name, or an error that names those the file has. */
export function zone(name: string, zones: Zone[] = rateLimitZones()): Zone {
  const found = zones.find((one) => one.name === name)
  if (!found) throw new Error(`No zone ${name}: ${zones.map((one) => one.name).join(', ')}`)
  return found
}

/** What a request over a limit gets (the Caddyfile's `handle_errors 429`). */
export const TOO_MANY = 'Too many requests. Please wait a moment and try again.'
