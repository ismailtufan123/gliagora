import { readFileSync } from 'node:fs'

import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { COLLECTIONS } from '@/collections'
import { GLOBALS } from '@/globals'

// The rules as written (src/lib/access.ts). tests/e2e/access.spec.ts checks the same over HTTP,
// together with Payload's own collections and routes.

type Rule = (args: never) => unknown

// A request without a signed-in user, as Payload hands it to an access function.
const SIGNED_OUT = { req: { user: null }, doc: {}, data: {}, siblingData: {} } as never

// Rules that are deliberately open to signed-out requests, as "slug.operation" or
// "slug.field.operation", each with a comment where it is set and an entry in the table of
// tests/e2e/access.spec.ts. None today.
const OPEN = new Set<string>()

function rulesOf(access: object | undefined, prefix: string): [string, Rule][] {
  return Object.entries(access ?? {})
    .filter((entry): entry is [string, Rule] => typeof entry[1] === 'function')
    .map(([operation, rule]) => [`${prefix}.${operation}`, rule])
}

/** Every field-level rule, also in rows, groups, tabs, arrays and blocks. */
function fieldRules(fields: Field[], prefix: string): [string, Rule][] {
  return fields.flatMap((field) => {
    const path = 'name' in field ? `${prefix}.${field.name}` : prefix
    const own = 'access' in field ? rulesOf(field.access, path) : []
    const nested =
      'fields' in field
        ? fieldRules(field.fields, path)
        : field.type === 'tabs'
          ? field.tabs.flatMap((tab) => fieldRules(tab.fields, path))
          : field.type === 'blocks'
            ? (field.blocks ?? []).flatMap((block) => fieldRules(block.fields, path))
            : []
    return [...own, ...nested]
  })
}

const ENTITIES = [
  ...COLLECTIONS.map((c) => ({
    slug: c.slug,
    operations: ['read', 'create', 'update', 'delete', ...(c.versions ? ['readVersions'] : [])],
    rules: [...rulesOf(c.access, c.slug), ...fieldRules(c.fields, c.slug)],
    access: c.access ?? {},
  })),
  ...GLOBALS.map((g) => ({
    slug: g.slug,
    operations: ['read', 'update', ...(g.versions ? ['readVersions'] : [])],
    rules: [...rulesOf(g.access, g.slug), ...fieldRules(g.fields, g.slug)],
    access: g.access ?? {},
  })),
]

describe('access rules (PLAN §18.2)', () => {
  it.each(ENTITIES)('$slug states who may do each operation', ({ slug, operations, access }) => {
    for (const operation of operations) {
      expect(
        typeof (access as Record<string, unknown>)[operation],
        `${slug}: set access.${operation} (src/lib/access.ts)`,
      ).toBe('function')
    }
  })

  it.each(ENTITIES)('$slug refuses signed-out requests', async ({ rules }) => {
    for (const [name, rule] of rules) {
      if (OPEN.has(name)) continue
      // A function replaces Payload's own check of the user, so it must check the user itself.
      expect(await rule(SIGNED_OUT), `${name} answers a signed-out request`).toBe(false)
    }
  })
})

describe('deploy/Caddyfile', () => {
  const caddyfile = readFileSync(new URL('../../deploy/Caddyfile', import.meta.url), 'utf8')

  it('keeps the second password in front of the admin and all of the API', () => {
    // Without /api, Payload's sign-in, password reset and first-account routes skip it.
    const matcher = caddyfile.match(/^\s*@admin path (.+)$/m)?.[1]?.split(/\s+/)
    expect(matcher).toEqual(expect.arrayContaining(['/admin', '/admin/*', '/api', '/api/*']))
    expect(caddyfile).toMatch(
      /handle @admin \{\s*import \/etc\/caddy\/admin-auth\.caddy\s*reverse_proxy app:3000\s*\}/,
    )
  })

  it('leaves only the health check itself open', () => {
    // Anything below /health/ would reach the site's 404 page, with its navigation.
    const matcher = caddyfile
      .match(/^\s*@health path (.+)$/m)?.[1]
      ?.trim()
      .split(/\s+/)
    expect(matcher).toEqual(['/health', '/health/'])
    expect(caddyfile).toMatch(
      /handle @health \{\s*rewrite \* \/health\/\s*reverse_proxy app:3000\s*\}/,
    )
  })

  it('keeps reset tokens and queries out of the logged redirect headers', () => {
    // Next.js's trailing-slash redirect repeats the request address in Location and Refresh.
    for (const header of ['Location', 'Refresh']) {
      if (new RegExp(`^\\s*resp_headers>${header} delete$`, 'm').test(caddyfile)) continue
      const rules =
        caddyfile.match(
          new RegExp(`^\\s*resp_headers>${header} multi_regexp \\{([^}]*)\\}`, 'm'),
        )?.[1] ?? ''
      expect(rules, `resp_headers>${header}`).toContain(
        'regexp /admin/reset/[^/?]+ /admin/reset/[removed]',
      )
      expect(rules, `resp_headers>${header}`).toContain('regexp \\?.*$ ?[removed]')
    }
  })
})

describe('Dockerfile', () => {
  it('gives Payload the trailing slash of the site', () => {
    // withPayload sets NEXT_TRAILING_SLASH only while next.config.ts runs, which the standalone
    // server does not. Without it, Payload's own links (password-reset emails, sign-in redirects)
    // lack the slash and are redirected, with the reset token, through the access log.
    const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8')
    const runtime = dockerfile.slice(dockerfile.indexOf(' AS runtime'))
    expect(runtime).toMatch(/^\s*(ENV\s+)?NEXT_TRAILING_SLASH=true\b/m)
  })
})
