import { readFileSync, readdirSync } from 'node:fs'

import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { COLLECTIONS } from '@/collections'
import { GLOBALS } from '@/globals'

import { nobody, signedIn } from './access'

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

describe('member accounts (M4b, D49)', () => {
  const bySlug = (slug: string) => COLLECTIONS.find((c) => c.slug === slug)!
  const HIDDEN = ['members', 'member-sessions', 'email-tokens', 'saved-items', 'deletion-log']

  it('are never Payload accounts: the editors (users) are the only collection with auth', () => {
    expect(COLLECTIONS.filter((c) => c.auth).map((c) => c.slug)).toEqual(['users'])
  })

  it.each(HIDDEN)('%s is closed to everyone, with no API routes and no copies', (slug) => {
    const collection = bySlug(slug)
    for (const operation of ['read', 'create', 'update', 'delete', 'readVersions', 'unlock']) {
      expect((collection.access as Record<string, unknown>)[operation], operation).toBe(nobody)
    }
    expect(collection.endpoints).toBe(false)
    expect(collection.admin?.hidden).toBe(true)
    expect(collection.graphQL).toBe(false)
    expect(collection.versions).toBeUndefined()
    expect(collection.disableDuplicate).toBe(true)
    expect(collection.lockDocuments).toBe(false)
  })

  it('data requests are handled by signed-in editors and deleted by nobody', () => {
    const { access } = bySlug('data-requests')
    expect(access).toMatchObject({
      read: signedIn,
      create: signedIn,
      update: signedIn,
      delete: nobody,
    })
    expect(bySlug('data-requests').endpoints).toBeUndefined()
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

  it('serves the basemap from its own folder, behind the password until the launch', () => {
    // M5 (PLAN §14): tiles, fonts and sprites from /opt/gliagora/basemap/public. Private until the
    // map goes public at M6 (D39); the fetch script's temporary folders (.fetch-…) are never served.
    const block = caddyfile.match(/^\s*handle @basemap \{([\s\S]*?)^\t\}/m)?.[1] ?? ''
    expect(caddyfile).toMatch(/^\s*@basemap path \/basemap\/\*$/m)
    expect(block).toMatch(/import \/etc\/caddy\/admin-auth\.caddy/)
    expect(block).toMatch(/uri strip_prefix \/basemap\n\s*root \* \/srv\/basemap/)
    expect(block).toMatch(/file_server \{\s*hide \.\*\s*\}/)
    expect(block).not.toMatch(/reverse_proxy/)
    // Before the site's catch-all handle, which would otherwise take /basemap/ to the app.
    expect(caddyfile.indexOf('handle @basemap')).toBeLessThan(caddyfile.lastIndexOf('\thandle {'))
  })

  /** The body of the block that starts with `opening` (`(log_fields) {`), its braces matched. */
  const blockAfter = (text: string, opening: string, from = 0): string => {
    const start = text.indexOf(opening, from)
    if (start < 0) return ''
    let depth = 0
    for (let i = start + opening.length - 1; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}' && --depth === 0) return text.slice(start + opening.length, i)
    }
    return ''
  }

  /** A logger's filter fields, with the snippets it imports written out. */
  const filterFields = (logger: string) => {
    const filter = blockAfter(logger, 'format filter {')
    return filter.replace(/^\s*import (\S+)\s*$/gm, (_line, name: string) =>
      blockAfter(caddyfile, `(${name}) {`),
    )
  }

  /** The request>uri rules of a logger's filter, as Caddy applies them (each in turn). */
  const uriFilter = (fields: string) => {
    const rules = [
      ...blockAfter(fields, 'request>uri multi_regexp {').matchAll(/regexp (\S+) (\S+)/g),
    ]
    expect(rules.length, 'request>uri rules').toBeGreaterThan(0)
    return (uri: string) =>
      rules.reduce(
        // Caddy writes a group as ${1}; RE2 and JavaScript read these patterns alike.
        (value, [, pattern, replacement]) =>
          value.replace(new RegExp(pattern!, 'g'), replacement!.replace(/\$\{(\d+)\}/g, '$$$1')),
        uri,
      )
  }

  it('keeps tokens and the queries of admin and member addresses out of both logs', () => {
    // The access log and Caddy's own log, which also gets the errors of requests (a 502 while the
    // app restarts) with the whole address: both import the same fields (M4b, D49).
    const loggers = {
      access: blockAfter(caddyfile, '(access_log) {'),
      default: blockAfter(caddyfile, 'log default {'),
    }
    expect(loggers.default).toMatch(/^\s*output stderr$/m)
    for (const [name, logger] of Object.entries(loggers)) {
      expect(logger, `${name} log`).toMatch(/format filter \{\s*import log_fields\s*\}/)
      const fields = filterFields(logger)
      expect(fields, `${name} log`).toMatch(/^\s*request>remote_ip ip_mask 24 48$/m)
      expect(fields, `${name} log`).toMatch(/^\s*request>headers>Cookie delete$/m)
      const filter = uriFilter(fields)
      for (const [uri, logged] of [
        ['/admin/reset/abc123token', '/admin/reset/[removed]'],
        [
          '/admin/collections/data-requests?where[email][equals]=a',
          '/admin/collections/data-requests?[removed]',
        ],
        ['/api/users/me?depth=1', '/api/users/me?[removed]'],
        ['/en/sign-in/link/?token=SECRET', '/en/sign-in/link/?[removed]'],
        ['/en/sign-in/link?token=SECRET', '/en/sign-in/link?[removed]'],
        ['/en/sign-in/?next=%2Fen%2Fjobs%2F&error=failed', '/en/sign-in/?[removed]'],
        ['/en/sign-in?next=%2Fen%2F', '/en/sign-in?[removed]'],
        ['/en/sign-in/google/callback/?code=C&state=S', '/en/sign-in/google/callback/?[removed]'],
        ['/en/account/?done=created', '/en/account/?[removed]'],
        [
          '/en/legal/data-requests/confirm/?token=SECRET',
          '/en/legal/data-requests/confirm/?[removed]',
        ],
        // Other addresses keep their queries: filters, searches.
        ['/en/jobs/?type=phd', '/en/jobs/?type=phd'],
        ['/en/search/?q=glia', '/en/search/?q=glia'],
        ['/en/sign-in-help/?x=1', '/en/sign-in-help/?x=1'],
        ['/en/accounting/?x=1', '/en/accounting/?x=1'],
        ['/en/sign-in/', '/en/sign-in/'],
      ]) {
        expect(filter(uri!), `${name} log: ${uri}`).toBe(logged)
      }
    }
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

describe('the production server’s files', () => {
  it('never name the test sign-in providers (AUTH_TEST_ISSUER)', () => {
    // Without the variable reaching the app, no test identity can reach the production database;
    // the app also ignores it where PAYLOAD_JOBS_AUTORUN is "true" (src/lib/members/config.ts).
    for (const file of ['compose.prod.yml', '.env.example']) {
      const text = readFileSync(new URL(`../../deploy/${file}`, import.meta.url), 'utf8')
      expect(text, `deploy/${file}`).not.toContain('AUTH_TEST_ISSUER')
    }
  })

  it('pass the sign-in keys to the app, with ORCID’s own issuer by default', () => {
    const compose = readFileSync(new URL('../../deploy/compose.prod.yml', import.meta.url), 'utf8')
    for (const name of [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'ORCID_CLIENT_ID',
      'ORCID_CLIENT_SECRET',
    ]) {
      expect(compose).toContain(`${name}: \${${name}:-}`)
    }
    expect(compose).toContain('ORCID_ISSUER: ${ORCID_ISSUER:-https://orcid.org}')
  })

  it('carry every column of the deletion log and the data requests over a restore', () => {
    // deploy/backup/restore.sh copies these rows by named columns (D49): a column it does not
    // name would be lost from every carried row. Compared with the newest migration's snapshot of
    // the tables, which `pnpm migrate:create` writes with each migration.
    const restore = readFileSync(new URL('../../deploy/backup/restore.sh', import.meta.url), 'utf8')
    const folder = new URL('../migrations/', import.meta.url)
    const newest = readdirSync(folder)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .at(-1)!
    const snapshot = JSON.parse(readFileSync(new URL(newest, folder), 'utf8')) as {
      tables: Record<string, { columns: Record<string, unknown> }>
    }
    for (const table of ['deletion_log', 'data_requests']) {
      const listed = new RegExp(`^CARRY_COLUMNS_${table}='([^']+)'$`, 'm').exec(restore)?.[1]
      expect(listed, `CARRY_COLUMNS_${table} in restore.sh`).toBeDefined()
      expect(listed!.split(', ').sort(), table).toEqual(
        Object.keys(snapshot.tables[`public.${table}`]!.columns).sort(),
      )
    }
    // Each carried table's sequence moves too, with those of the records the log names.
    const sequences = /^SEQUENCE_TABLES=\(([^)]*)\)$/m.exec(restore)?.[1]?.split(' ')
    expect(sequences).toEqual([
      'members',
      'submissions',
      'reports',
      'data_requests',
      'deletion_log',
    ])
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
