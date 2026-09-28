import { readFileSync } from 'node:fs'

import {
  type APIRequestContext,
  type APIResponse,
  expect,
  request as newRequestContext,
  test,
} from '@playwright/test'

import { JOB_STATUSES } from '../../src/lib/jobs/status'
import { REPORT_STATUSES } from '../../src/lib/reports/status'
import { CANDIDATE_STATUSES, SUBMISSION_STATUSES } from '../../src/lib/review/status'
import { editorHeaders, editorPassword } from './editor'

// Signed out, Payload's API gives nothing (PLAN §18.2, src/lib/access.ts): no collection or global
// can be read, created, changed or deleted, no draft or unpublished record is shown, and no
// personal data (suggestions, reports, email addresses) leaves the server. The public pages read
// through Payload's local API instead, with their own queries.
//
// The collections and globals are read from src/payload-types.ts when the test runs, so a new one
// is covered once the types are regenerated (`pnpm generate:types`; CI fails while the committed
// file is out of date, and the editor's step below names any collection or global the running app
// has and the file lacks). The table below says what each may show a signed-out request, and one
// without an entry fails the test.
//
// Real IDs and the personal values to look for come from the test editor (`pnpm e2e:editor`,
// E2E_EDITOR_PASSWORD, tests/e2e/editor.ts; CI always has it), in a request context of its own.
// Besides the newest documents, it samples one in each state that a rule for single documents
// could treat differently (STATES), and each must exist in the test data. Without the password,
// the test uses small IDs and skips the checks that need the editor.

/**
 * What each collection and global may show a signed-out request through the API: today nothing.
 * A deliberately public read (say, the map's places in M5) needs an entry that says so, a comment
 * where its access rule is set, and a check here of what exactly it shows.
 */
type SignedOut = {
  shows: 'nothing'
  /** How Payload's own routes for it answer instead of refusing (none of them shows data). */
  routes?: 'none' | 'preference by key'
  /** The editor's own admin state, which other tests change while this one runs: not compared. */
  changesDuringTests?: true
}

const SIGNED_OUT: Record<string, SignedOut> = {
  users: { shows: 'nothing' },
  candidates: { shows: 'nothing' },
  submissions: { shows: 'nothing' },
  reports: { shows: 'nothing' },
  jobs: { shows: 'nothing' },
  'retired-listings': { shows: 'nothing' },
  terms: { shows: 'nothing' },
  countries: { shows: 'nothing' },
  'country-sets': { shows: 'nothing' },
  institutions: { shows: 'nothing' },
  'form-limits': { shows: 'nothing' },
  // Payload's own collections.
  'payload-kv': { shows: 'nothing' },
  'payload-jobs': { shows: 'nothing' },
  'payload-locked-documents': { shows: 'nothing', changesDuringTests: true },
  // GET /api/payload-preferences/<key>/ looks only among the signed-in user's own preferences:
  // signed out it answers 200 with an empty value.
  'payload-preferences': {
    shows: 'nothing',
    routes: 'preference by key',
    changesDuringTests: true,
  },
  // No REST routes at all (`endpoints: false`): every request answers 501.
  'payload-migrations': { shows: 'nothing', routes: 'none' },
  // Globals.
  'ror-import': { shows: 'nothing' },
  'payload-jobs-stats': { shows: 'nothing' },
}

/** The keys of `collections` or `globals` in the Config interface of src/payload-types.ts. */
function configKeys(name: 'collections' | 'globals'): string[] {
  const types = readFileSync(new URL('../../src/payload-types.ts', import.meta.url), 'utf8')
  const config = types.slice(types.indexOf('export interface Config {'))
  const block = config.match(new RegExp(`\\n {2}${name}: \\{\\n([\\s\\S]*?)\\n {2}\\};`))?.[1]
  expect(block, `Config.${name} in src/payload-types.ts`).toBeDefined()
  return [...block!.matchAll(/^ {4}'?([\w-]+)'?:/gm)].map((match) => match[1]!)
}

const COLLECTIONS = configKeys('collections')
const GLOBALS = configKeys('globals')

const each = (field: string, values: readonly { value: string }[]) =>
  values.map(({ value }) => `where[${field}][equals]=${value}&limit=1`)

/**
 * Queries for documents in each state that an access rule for single documents could treat
 * differently, sampled besides the newest ones: a rule that opened drafts, suggestions without a
 * candidate or institutions added by hand to signed-out requests would otherwise pass whenever the
 * newest documents are in another state. Each must find a document in the test data (`pnpm
 * fake:jobs`, src/scripts/fake-jobs-fixed.ts and fake-queue-data.ts).
 */
const STATES: Record<string, string[]> = {
  jobs: each('status', JOB_STATUSES),
  candidates: each('status', CANDIDATE_STATUSES),
  submissions: [
    'where[email][exists]=true&limit=3',
    'where[candidate][exists]=false&limit=3',
    ...each('kind', [{ value: 'position' }, { value: 'event' }, { value: 'funding' }]),
    ...each('status', SUBMISSION_STATUSES),
  ],
  reports: ['where[email][exists]=true&limit=3', ...each('status', REPORT_STATUSES)],
  // Editors may delete only institutions added by hand (MANUAL_INSTITUTION in the test data).
  institutions: each('origin', [{ value: 'manual' }, { value: 'ror' }]),
}

type ID = number | string
type Doc = { id: ID; updatedAt?: string } & Record<string, unknown>
type Sample = {
  ids: ID[]
  /** Versions are on (known from the editor's /api/access/). */
  versions?: boolean
  versionIds: ID[]
  /** updatedAt of each sampled document, to compare afterwards. */
  stamps: Map<ID, string | undefined>
  /** How many documents were created before the test, to compare afterwards. */
  count?: number
}

// Anything that looks like an email address.
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

// A refusal: Payload answers 403 when access is denied, 401 on a few of its own routes.
const REFUSED = [401, 403]

const camel = (slug: string) => slug.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())
const pascal = (slug: string) => camel(slug).replace(/^\w/, (letter) => letter.toUpperCase())

/** Every place in a permissions answer that grants something. */
function granted(value: unknown, path = ''): string[] {
  if (value === true) return [path]
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, inner]) =>
    granted(inner, path ? `${path}.${key}` : key),
  )
}

test.describe('signed out, the API gives nothing', () => {
  test.skip(({ isMobile }) => isMobile, 'the API does not depend on the device')

  test('every collection and global refuses signed-out requests', async ({ request, baseURL }) => {
    test.setTimeout(180_000)

    await test.step('every collection and global has an entry in the table', async () => {
      const slugs = [...COLLECTIONS, ...GLOBALS]
      expect(COLLECTIONS.length).toBeGreaterThan(10)
      const missing = slugs.filter((slug) => !SIGNED_OUT[slug])
      expect(
        missing,
        'add these to SIGNED_OUT in tests/e2e/access.spec.ts: what may a signed-out request see?',
      ).toEqual([])
      const stale = Object.keys(SIGNED_OUT).filter((slug) => !slugs.includes(slug))
      expect(stale, 'no longer in src/payload-types.ts: remove from SIGNED_OUT').toEqual([])
    })

    // The editor's view: real IDs, the personal values to look for, and the state to compare.
    const samples = new Map<string, Sample>()
    const secrets: { kind: string; value: string }[] = []
    let editor: APIRequestContext | undefined
    const startedAt = new Date().toISOString()

    const noEditor =
      'E2E_EDITOR_PASSWORD is not set: small IDs instead of real ones, no personal values to look for, nothing compared afterwards'
    if (!editorPassword) test.info().annotations.push({ type: 'skip', description: noEditor })

    await test.step('the editor collects IDs and personal values', async (step) => {
      step.skip(!editorPassword, noEditor)
      editor = await newRequestContext.newContext({ baseURL, extraHTTPHeaders: editorHeaders() })

      const read = async (path: string): Promise<Doc[]> => {
        const response = await editor!.get(path)
        if (response.status() !== 200) return []
        return ((await response.json()) as { docs?: Doc[] }).docs ?? []
      }
      const keep = (kind: string, value: unknown) => {
        // Short values (a language code, a kind) could appear anywhere; these are long texts.
        if (typeof value === 'string' && value.trim().length >= 8) {
          secrets.push({ kind, value: value.trim() })
        }
      }

      // Payload lists `readVersions` only for collections and globals with versions.
      const access = (await (await editor.get('/api/access/')).json()) as {
        collections: Record<string, Record<string, unknown>>
        globals: Record<string, Record<string, unknown>>
      }
      // The overview names every collection and global the editor has any permission on (Payload
      // leaves out those with none), so it finds those src/payload-types.ts lacks, not the reverse.
      const untyped =
        'in the running app but not in src/payload-types.ts: run `pnpm generate:types` and add them to SIGNED_OUT'
      expect
        .soft(
          Object.keys(access.collections).filter((slug) => !COLLECTIONS.includes(slug)),
          untyped,
        )
        .toEqual([])
      expect
        .soft(
          Object.keys(access.globals).filter((slug) => !GLOBALS.includes(slug)),
          untyped,
        )
        .toEqual([])

      for (const slug of COLLECTIONS) {
        const docs = await read(`/api/${slug}/?limit=3&depth=0`)
        for (const query of STATES[slug] ?? []) {
          const found = await read(`/api/${slug}/?${query}&depth=0`)
          expect.soft(found.length, `${slug} ?${query} in the test data`).toBeGreaterThan(0)
          docs.push(...found)
        }
        const unique = [...new Map(docs.map((doc) => [doc.id, doc])).values()]
        const versions = 'readVersions' in (access.collections[slug] ?? {})
        const versionIds = versions
          ? (await read(`/api/${slug}/versions/?limit=1&depth=0`)).map((version) => version.id)
          : []
        let count: number | undefined
        if (unique.length) {
          const counted = await editor.get(
            `/api/${slug}/count/?where[createdAt][less_than_equal]=${encodeURIComponent(startedAt)}`,
          )
          if (counted.status() === 200)
            count = ((await counted.json()) as { totalDocs: number }).totalDocs
        }
        samples.set(slug, {
          ids: unique.map((doc) => doc.id),
          versions,
          versionIds,
          stamps: new Map(unique.map((doc) => [doc.id, doc.updatedAt])),
          count,
        })
      }
      // The personal values in the fake data, and what is not public yet.
      for (const doc of await read('/api/submissions/?limit=100&depth=0')) {
        keep('a suggestion’s email address', doc.email)
        keep('a suggestion’s note', doc.note)
      }
      for (const doc of await read('/api/reports/?limit=100&depth=0')) {
        keep('a report’s email address', doc.email)
        keep('a report’s details', doc.details)
        keep('a report’s action note', doc.actionNote)
      }
      for (const doc of await read('/api/candidates/?limit=100&depth=0')) {
        keep('a candidate’s decision note', doc.decisionNote)
        keep('a candidate’s source text', doc.snippet)
      }
      for (const doc of await read('/api/jobs/?limit=200&depth=0')) {
        keep('a job’s internal notes', doc.internalNotes)
        if (doc.status === 'draft' || doc.status === 'in_review')
          keep('a hidden job’s title', doc.title)
      }
      expect(secrets.some(({ kind }) => kind.includes('email address'))).toBe(true)

      for (const slug of GLOBALS) {
        samples.set(slug, {
          ids: [],
          versions: 'readVersions' in (access.globals[slug] ?? {}),
          versionIds: [],
          stamps: new Map(),
        })
      }
    })

    // Every signed-out answer: its status is checked by the caller, its body here.
    let answers = 0
    const send = async (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      options: {
        data?: unknown
        form?: Record<string, string>
        headers?: Record<string, string>
      } = {},
    ): Promise<{ response: APIResponse; label: string; text: string }> => {
      const response = await request.fetch(path, { method, maxRedirects: 0, ...options })
      const label = `${method} ${path}`
      const text = await response.text()
      answers++
      // Named, so a failure lists what was found rather than the whole answer.
      expect.soft(text.match(EMAIL) ?? [], `${label}: email addresses`).toEqual([])
      const found = new Set(secrets.filter(({ value }) => text.includes(value)).map((s) => s.kind))
      expect.soft([...found], `${label}: personal or unpublished values`).toEqual([])
      return { response, label, text }
    }
    const expectStatus = async (
      answer: Promise<{ response: APIResponse; label: string }>,
      allowed: number[],
    ) => {
      const { response, label } = await answer
      expect.soft(allowed, `${label} answered ${response.status()}`).toContain(response.status())
    }

    for (const slug of COLLECTIONS) {
      await test.step(`collection ${slug}`, async () => {
        const table = SIGNED_OUT[slug]
        const sample = samples.get(slug)
        const ids = sample?.ids.length ? sample.ids : [1, 2]
        const versionIds = sample?.versionIds.length ? sample.versionIds : [1]
        const base = `/api/${slug}`
        const where = `where[id][in]=${ids.map((id) => encodeURIComponent(String(id))).join(',')}`
        // No routes: 501 for everything. Otherwise a refusal, or 404 where the route is off.
        const refused = table?.routes === 'none' ? [501] : REFUSED
        const refusedOrOff = table?.routes === 'none' ? [501] : [...REFUSED, 404]
        // GET /api/payload-preferences/<anything>/ is the preference route: an empty value.
        const byKey = async (answer: ReturnType<typeof send>) => {
          if (table?.routes !== 'preference by key') return expectStatus(answer, refused)
          const { response, label, text } = await answer
          expect.soft(response.status(), label).toBe(200)
          expect.soft(JSON.parse(text), label).toMatchObject({ value: null })
        }

        // Reads: the list in several forms, the count, each document, its versions.
        for (const query of [
          '',
          '?draft=true',
          '?depth=2',
          '?locale=all&depth=1',
          '?limit=0&pagination=false&where[id][exists]=true',
          '?select[email]=true&select[note]=true&select[details]=true',
        ]) {
          await expectStatus(send('GET', `${base}/${query}`), refused)
        }
        // The same read sent as a POST (Payload's method override).
        await expectStatus(
          send('POST', `${base}/`, {
            headers: { 'X-Payload-HTTP-Method-Override': 'GET' },
            form: { depth: '1' },
          }),
          refused,
        )
        await byKey(send('GET', `${base}/count/`))
        for (const id of ids) {
          await byKey(send('GET', `${base}/${id}/`))
          await byKey(send('GET', `${base}/${id}/?depth=2&draft=true&locale=all`))
        }
        if (sample?.versions !== false) {
          await byKey(send('GET', `${base}/versions/`))
          for (const id of versionIds) {
            await expectStatus(send('GET', `${base}/versions/${id}/?depth=1`), refusedOrOff)
          }
        }

        // Writes: create, update, delete (by ID and by a query), duplicate, restore a version.
        await expectStatus(send('POST', `${base}/`, { data: {} }), refused)
        for (const id of ids) {
          await expectStatus(send('PATCH', `${base}/${id}/`, { data: {} }), refused)
        }
        await expectStatus(send('PATCH', `${base}/?${where}`, { data: {} }), refused)
        for (const id of ids) {
          await expectStatus(send('DELETE', `${base}/${id}/`), refused)
        }
        await expectStatus(send('DELETE', `${base}/?${where}`), refused)
        for (const id of ids) {
          // 404 where copies are switched off (disableDuplicate).
          await expectStatus(send('POST', `${base}/${id}/duplicate/`), refusedOrOff)
        }
        if (sample?.versions) {
          // Only where versions are on: elsewhere Payload fails on the missing versions table.
          for (const id of versionIds) {
            await expectStatus(send('POST', `${base}/versions/${id}/`, { data: {} }), refused)
          }
        }

        // Payload's permission route for one document: nothing granted.
        for (const id of ids) {
          const { response, label, text } = await send('POST', `${base}/access/${id}/`)
          if (response.status() === 200) {
            expect.soft(granted(JSON.parse(text)), `${label} grants`).toEqual([])
          } else {
            expect
              .soft(refusedOrOff, `${label} answered ${response.status()}`)
              .toContain(response.status())
          }
        }
      })
    }

    for (const slug of GLOBALS) {
      await test.step(`global ${slug}`, async () => {
        const base = `/api/globals/${slug}`
        for (const query of ['', '?depth=2', '?draft=true&locale=all']) {
          await expectStatus(send('GET', `${base}/${query}`), REFUSED)
        }
        await expectStatus(send('POST', `${base}/`, { data: {} }), REFUSED)
        await expectStatus(send('GET', `${base}/versions/`), REFUSED)
        await expectStatus(send('GET', `${base}/versions/1/`), REFUSED)
        if (samples.get(slug)?.versions) {
          await expectStatus(send('POST', `${base}/versions/1/`, { data: {} }), [...REFUSED, 404])
        }
        const { response, label, text } = await send('POST', `${base}/access/`)
        expect.soft(response.status(), label).toBe(200)
        expect.soft(granted(JSON.parse(text)), `${label} grants`).toEqual([])
      })
    }

    await test.step('sign-in and system routes', async () => {
      const me = await send('GET', '/api/users/me/')
      expect.soft(me.response.status(), me.label).toBe(200)
      expect.soft(JSON.parse(me.text), me.label).toMatchObject({ user: null })

      // Users exist, so the first-account route is closed. Without a password, it could not
      // create an account even if it were open.
      await expectStatus(
        send('POST', '/api/users/first-register/', { data: { email: 'first-user@example.org' } }),
        [403],
      )
      await expectStatus(send('POST', '/api/users/refresh-token/'), REFUSED)
      await expectStatus(
        send('POST', '/api/users/unlock/', { data: { email: 'nobody@example.org' } }),
        REFUSED,
      )
      await expectStatus(
        send('POST', '/api/users/reset-password/', {
          data: { token: 'not-a-token', password: 'not-a-password' },
        }),
        REFUSED,
      )

      // Payload's permission overview: nothing granted. Payload lists the read rule of its own
      // `sessions` field of users as true: it compares the user with a document, and without
      // either both are missing. Reading a user needs a signed-in editor anyway.
      const access = await send('GET', '/api/access/')
      expect.soft(access.response.status(), access.label).toBe(200)
      expect
        .soft(
          granted(JSON.parse(access.text)).filter(
            (path) => !path.startsWith('collections.users.fields.sessions.'),
          ),
          `${access.label} grants`,
        )
        .toEqual([])

      // The scheduled work runs only on the server's own schedule.
      await expectStatus(send('GET', '/api/payload-jobs/run/'), [401])
      await expectStatus(send('GET', '/api/payload-jobs/run/?allQueues=true'), [401])
      await expectStatus(send('GET', '/api/payload-jobs/handle-schedules/'), [401])
    })

    await test.step('GraphQL is off', async () => {
      // Off in payload.config.ts: every query and mutation answers 404 without being read. If it
      // is ever switched on, this step must check each query and mutation instead.
      const operations = [
        '{ __schema { types { name } } }',
        ...COLLECTIONS.flatMap((slug) => [
          `{ ${pascal(slug)}(limit: 1) { totalDocs docs { id } } }`,
          `mutation { delete${pascal(slug)}(id: 1) { id } }`,
        ]),
        ...GLOBALS.map((slug) => `{ ${pascal(slug)} { updatedAt } }`),
        'mutation { loginUser(email: "nobody@example.org", password: "not-a-password") { token } }',
      ]
      for (const query of operations) {
        const { response, label } = await send('POST', '/api/graphql/', { data: { query } })
        expect.soft(response.status(), `${label} ${query}`).toBe(404)
      }
      await expectStatus(send('GET', '/api/graphql-playground/'), [404])
    })

    await test.step('nothing changed', async (step) => {
      step.skip(!editor, 'needs the test editor (E2E_EDITOR_PASSWORD) to compare')
      for (const [slug, sample] of samples) {
        if (SIGNED_OUT[slug]?.changesDuringTests) continue
        for (const [id, updatedAt] of sample.stamps) {
          const response = await editor!.get(`/api/${slug}/${id}/?depth=0`)
          expect.soft(response.status(), `${slug} ${id} still exists`).toBe(200)
          if (response.status() === 200) {
            const doc = (await response.json()) as Doc
            expect.soft(doc.updatedAt, `${slug} ${id} unchanged`).toBe(updatedAt)
          }
        }
        if (sample.count !== undefined) {
          const counted = await editor!.get(
            `/api/${slug}/count/?where[createdAt][less_than_equal]=${encodeURIComponent(startedAt)}`,
          )
          const { totalDocs } = (await counted.json()) as { totalDocs: number }
          expect.soft(totalDocs, `${slug}: documents from before the test`).toBe(sample.count)
        }
      }
      await editor!.dispose()
    })

    // At least one request per route above; every answer was checked for personal data.
    expect(answers).toBeGreaterThan(300)
    test.info().annotations.push({
      type: 'checked',
      description: `${answers} signed-out answers, ${secrets.length} personal values looked for`,
    })
  })
})
