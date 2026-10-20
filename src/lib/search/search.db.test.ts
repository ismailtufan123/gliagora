import { randomUUID } from 'node:crypto'

import { type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { migrations } from '@/migrations'
import * as searchMigration from '@/migrations/20260928_100000_search'

import { type Search, canMatchInstitutions, readSearch, searchText } from './parse'
import {
  foldSql,
  institutionsSql,
  matchingJobIdsSql,
  rankedJobsSql,
  subfieldsSql,
  tsQuery,
} from './sql'

// The search against a real PostgreSQL (`pnpm test:db`; CI runs it next to the end-to-end tests).
// It creates a scratch database owned by a new role that is not a superuser, as on the server
// (deploy/postgres/init/10-app-database.sh), runs every migration there as that role, adds a few
// fake records and checks the queries of sql.ts. Both are dropped at the end. Needs a connection
// that may create roles and databases in TEST_DATABASE_URL (the local superuser from .env).

const ADMIN_URL = process.env.TEST_DATABASE_URL

type Database = ReturnType<typeof drizzle>

const NOW = new Date('2026-10-01T12:00:00.000Z')
const DAY = 86_400_000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

describe.skipIf(!ADMIN_URL)('search on a scratch database', () => {
  const name = `search_test_${process.pid}_${Date.now()}`
  const password = randomUUID()
  let admin: Database
  let db: Database
  const ids: Record<string, number> = {}

  const rows = async <T>(query: SQL) => (await db.execute(query)).rows as T[]
  const one = async <T>(query: SQL) => (await rows<T>(query))[0] as T
  /** The search as database.ts prepares it: folded by the database, then read by parse.ts. */
  const parse = async (q: string): Promise<Search | null> => {
    const text = searchText(q)
    if (!text) return null
    return readSearch(text, (await one<{ folded: string }>(foldSql(text))).folded)
  }
  const search = async (q: string) => {
    const parsed = await parse(q)
    if (!parsed) throw new Error(`No search in ${q}`)
    return parsed
  }
  const jobs = async (q: string) =>
    (await rows<{ id: number }>(rankedJobsSql(await search(q), NOW, 10))).map((row) => row.id)
  const institutions = async (q: string) =>
    (
      await rows<{ name: string; total: number; open_jobs: number }>(
        institutionsSql(await search(q), NOW, 'en', 10),
      )
    ).map((row) => row.name)

  async function institution(values: { name: string; status?: string; aliases?: string[] }) {
    const { id } = await one<{ id: number }>(sql`
      insert into institutions (name, slug, short_id, origin, status, country_id)
      values (${values.name}, 'x', ${randomUUID().slice(0, 5)}, 'manual', ${values.status ?? 'active'}, 'TR')
      returning id`)
    for (const [order, alias] of (values.aliases ?? []).entries()) {
      await db.execute(sql`
        insert into institutions_texts ("order", parent_id, path, text)
        values (${order + 1}, ${id}, 'aliases', ${alias})`)
    }
    return id
  }

  async function job(values: {
    title: string
    summary: string
    institution: number
    status?: string
    kind?: string
    deadlineInDays?: number
  }) {
    const { id } = await one<{ id: number }>(sql`
      insert into jobs (title, summary, institution_id, status, deadline_kind, deadline_at,
        published_at, short_id, slug)
      values (${values.title}, ${values.summary}, ${values.institution},
        ${values.status ?? 'published'}, ${values.kind ?? 'fixed'},
        ${values.kind === 'rolling' ? null : at(values.deadlineInDays ?? 30)}, ${at(-5)},
        ${randomUUID().slice(0, 5)}, 'x')
      returning id`)
    return id
  }

  /** Tags a job with taxonomy terms (seeded by the migrations), as Payload stores them. */
  async function tag(jobId: number, path: string, slugs: string[]) {
    for (const [order, slug] of slugs.entries()) {
      await db.execute(sql`
        insert into jobs_rels ("order", parent_id, path, terms_id)
        select ${order + 1}, ${jobId}, ${path}, t.id from terms t where t.slug = ${slug}`)
    }
  }

  beforeAll(async () => {
    admin = drizzle(ADMIN_URL!)
    // Identifiers cannot be parameters; these are made here, from digits and a UUID.
    await admin.execute(
      sql.raw(
        `CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`,
      ),
    )
    await admin.execute(sql.raw(`CREATE DATABASE ${name} OWNER ${name}`))
    const url = new URL(ADMIN_URL!)
    url.username = name
    url.password = password
    url.pathname = `/${name}`
    db = drizzle(url.toString())
    for (const migration of migrations) {
      await migration.up({ db } as unknown as MigrateUpArgs)
    }

    const istanbul = await institution({
      name: 'İstanbul Üniversitesi',
      aliases: ['Istanbul University'],
    })
    const karolinska = await institution({ name: 'Karolinska Institutet', aliases: ['KI'] })
    const geneva = await institution({
      name: 'Université de Genève',
      aliases: ['University of Geneva'],
    })
    await institution({ name: 'İstanbul Old Institute', status: 'withdrawn' })
    await institution({ name: 'İstanbul Closed Institute', status: 'inactive' })
    const planck = await institution({ name: 'Max-Planck-Institut für Hirnforschung' })

    ids.phd = await job({
      title: 'PhD position in astrocyte–neuron signalling',
      summary: 'A doctoral project on calcium imaging in mice.',
      institution: karolinska,
    })
    ids.postdoc = await job({
      title: 'Postdoctoral researcher in glial biology',
      summary: 'Work on astrocytes with MSc/PhD students.',
      institution: istanbul,
      kind: 'rolling',
    })
    ids.engineer = await job({
      title: 'Research engineer for neural data pipelines',
      summary: 'Data from astrocyte recordings, among others.',
      institution: geneva,
      deadlineInDays: 10,
    })
    ids.expired = await job({
      title: 'Astrocyte imaging technician',
      summary: 'Closed.',
      institution: karolinska,
      status: 'expired',
      deadlineInDays: -10,
    })
    ids.draft = await job({
      title: 'Astrocyte group leader',
      summary: 'Not published.',
      institution: karolinska,
      status: 'draft',
    })
    ids.pastDeadline = await job({
      title: 'Astrocyte data scientist',
      summary: 'Published, but its deadline day has ended.',
      institution: karolinska,
      deadlineInDays: -1,
    })
    // Found by its tags only (D56): neither its title nor its summary names them.
    ids.manager = await job({
      title: 'Laboratory manager',
      summary: 'Runs the lab day to day.',
      institution: geneva,
      deadlineInDays: 40,
    })
    await tag(ids.manager, 'subfields', ['glia', 'systems-circuits'])
    await tag(ids.manager, 'methods', ['electrophysiology'])
    await tag(ids.manager, 'modelSystems', ['zebrafish'])
    // Tagged the same, but closed: never found.
    await tag(ids.expired, 'subfields', ['glia'])
    // Enough open positions that the planner reads the full-text index, as it will on the server.
    await db.execute(sql`
      insert into jobs (title, summary, institution_id, status, deadline_kind, deadline_at,
        published_at, short_id, slug)
      select 'Filler job ' || n, 'Generated so that the planner sees a realistic table.',
        ${planck}, 'published', 'fixed', ${at(20)}, ${at(-5)}, 'z' || lpad(n::text, 4, '0'), 'x'
      from generate_series(1, 3000) n`)
    await db.execute(sql`ANALYZE`)
  }, 120_000)

  afterAll(async () => {
    await db?.$client.end()
    if (admin) {
      // pg's Pool.end() resolves while its connections are still closing. Dropping the database
      // WITH (FORCE) at that moment ends them with an error (57P01) that the pool passes on as an
      // unhandled 'error' event, which fails the run although every test passed. So wait until the
      // server has no connection to the database left; FORCE is only the fallback.
      for (let tries = 0; tries < 50; tries++) {
        const { rows } = await admin.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity where datname = ${name}`,
        )
        if (Number(rows[0]?.n ?? 0) === 0) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      await admin.execute(sql.raw(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`))
      await admin.execute(sql.raw(`DROP ROLE IF EXISTS ${name}`))
      await admin.$client.end()
    }
  })

  describe('the migration', () => {
    const objects = () =>
      one<{ extensions: string[]; functions: number; indexes: string[] }>(sql`
        select
          (select array_agg(extname::text order by extname) from pg_extension
            where extname in ('pg_trgm', 'unaccent')) as extensions,
          (select count(*)::int from pg_proc where proname = 'f_unaccent') as functions,
          (select coalesce(array_agg(indexname::text order by indexname), '{}') from pg_indexes
            where indexname in ('jobs_fulltext_idx', 'institutions_name_trgm_idx',
              'institutions_texts_aliases_trgm_idx')) as indexes`)

    it('runs as the database owner, who is not a superuser (trusted extensions)', async () => {
      const role = await one<{ super: boolean; owner: boolean }>(sql`
        select rolsuper as super,
          (select datdba = r.oid from pg_database where datname = current_database()) as owner
        from pg_roles r where rolname = current_user`)
      expect(role).toEqual({ super: false, owner: true })
      expect(await objects()).toEqual({
        extensions: ['pg_trgm', 'unaccent'],
        functions: 1,
        indexes: [
          'institutions_name_trgm_idx',
          'institutions_texts_aliases_trgm_idx',
          'jobs_fulltext_idx',
        ],
      })
    })

    it('goes down and up again; down keeps the extensions', async () => {
      await searchMigration.down({ db } as unknown as MigrateUpArgs)
      expect(await objects()).toEqual({
        extensions: ['pg_trgm', 'unaccent'],
        functions: 0,
        indexes: [],
      })
      await searchMigration.up({ db } as unknown as MigrateUpArgs)
      expect((await objects()).indexes).toHaveLength(3)
      await db.execute(sql`ANALYZE`)
    })

    it('makes a function that folds case, Turkish i and accents', async () => {
      const { folded } = await one<{ folded: string }>(
        sql`select public.f_unaccent(lower(${'İSTANBUL ıstanbul Üniversitesi Genève ŞĞÇÖ'})) as folded`,
      )
      expect(folded).toBe('istanbul istanbul universitesi geneve sgco')
    })
  })

  describe('the query, as the database folds it', () => {
    it('reads its words from the folded query, where marks are gone', async () => {
      // x with two combining graves folds to "x": one letter, so no prefix and no institutions.
      const marks = await search('x\u0300\u0300')
      expect(marks.words).toEqual(['x'])
      expect(marks.prefix).toBe(false)
      expect(canMatchInstitutions(marks)).toBe(false)
      // Marks alone fold to nothing: "a" is the last word, and too short for a prefix.
      const alone = await search('a \u0300\u0300\u0300')
      expect(alone.words).toEqual(['a'])
      expect(alone.prefix).toBe(false)
      expect(await one(sql`select ${tsQuery(alone)}::text as q`)).toEqual({ q: "'a'" })
      // Number signs give no trigrams.
      expect(canMatchInstitutions(await search('①②③ ¹²³'))).toBe(false)
      expect(canMatchInstitutions(await search('东京大'))).toBe(true)
    })

    it('counts a word once whatever its accents, and drops words that start another', async () => {
      expect((await search('uni üni ûni ùni ÜNİ')).words).toEqual(['uni'])
      expect((await search('uni univ university')).words).toEqual(['university'])
    })

    it('reads typographic dashes and quotes as the full-text search does', async () => {
      for (const [q, words] of [
        ['neuron –mouse', ['neuron']],
        ['glia −mouse', ['glia']],
        ['karolinska -“university hospital”', ['karolinska']],
        ['“a or b”', ['a', 'or', 'b']],
      ] as const) {
        expect((await search(q)).allWords, q).toEqual(words)
      }
      expect((await search('glia “cortical circuit”')).prefix).toBe(false)
    })
  })

  describe('positions', () => {
    it('finds open positions only', async () => {
      expect((await jobs('astrocyte')).sort()).toEqual([ids.phd, ids.postdoc, ids.engineer].sort())
      for (const q of ['technician', 'group leader', 'data scientist']) {
        expect(await jobs(q), q).toEqual([])
      }
    })

    it('ranks a word in the title above the same word in the summary, then by deadline', async () => {
      // Equal ranks (a word in each summary): the nearer deadline first, rolling ones after.
      expect(await jobs('astrocyte')).toEqual([ids.phd, ids.engineer, ids.postdoc])
    })

    it('finds longer words from the last word (prefix)', async () => {
      expect((await jobs('astro')).sort()).toEqual([ids.phd, ids.postdoc, ids.engineer].sort())
      expect(await jobs('glia')).toEqual([ids.postdoc, ids.manager])
      // Only the last word, and only from three characters.
      expect(await jobs('astro calcium')).toEqual([])
      expect(await jobs('po')).toEqual([])
    })

    it("finds positions by their institution's name, folded", async () => {
      for (const q of [
        'İstanbul',
        'istanbul',
        'ISTANBUL',
        'Istanbul',
        'ıstanbul',
        'üniversitesi',
      ]) {
        expect(await jobs(q), q).toEqual([ids.postdoc])
      }
      expect(await jobs('phd karolinska')).toEqual([ids.phd])
      expect(await jobs('istanbul postdoc')).toEqual([ids.postdoc])
      expect(await jobs('geneve')).toEqual([ids.engineer, ids.manager])
    })

    it('reads a slash as a space, and web search syntax', async () => {
      expect((await jobs('phd')).sort()).toEqual([ids.phd, ids.postdoc].sort())
      expect(await jobs('"calcium imaging"')).toEqual([ids.phd])
      expect(await jobs('"imaging calcium"')).toEqual([])
      expect((await jobs('-mice astrocyte')).sort()).toEqual([ids.postdoc, ids.engineer].sort())
      // A word left out ends the query: the one before it is matched exactly ("astrocytes" is not).
      expect(await jobs('astrocyte -mice')).toEqual([ids.engineer])
      expect((await jobs('calcium or pipelines')).sort()).toEqual([ids.phd, ids.engineer].sort())
      expect(await jobs('astrocyte –mice')).toEqual([ids.engineer])
    })

    it('finds a phrase within the title, the institution or the summary, never across', async () => {
      expect(await jobs('"karolinska institutet"')).toEqual([ids.phd])
      expect(await jobs('"neuron signalling"')).toEqual([ids.phd])
      expect(await jobs('"a doctoral project"')).toEqual([ids.phd])
      // The title's last word and the institution's first; the institution's last and the
      // summary's first.
      expect(await jobs('"signalling karolinska"')).toEqual([])
      expect(await jobs('"institutet a doctoral"')).toEqual([])
      expect(await jobs('"biology istanbul"')).toEqual([])
      expect(await jobs('signalling karolinska')).toEqual([ids.phd])
    })

    it("finds a position by its institution's name after the eighth word", async () => {
      // Nine words: only the last one is in the institution's name, none in the title or summary.
      const q = 'phd position astrocyte neuron signalling doctoral project calcium karolinska'
      expect((await search(q)).words).toHaveLength(8)
      expect(await jobs(q)).toEqual([ids.phd])
      expect(await jobs(q.replace(' doctoral', ''))).toEqual([ids.phd])
    })

    it('never fails on punctuation or tsquery syntax', async () => {
      for (const q of ["astro:* & | ! ( ) '", 'C++ <-> x', "o'neil", '\\ % _ " " - -']) {
        const parsed = await parse(q)
        if (parsed) await expect(rows(rankedJobsSql(parsed, NOW, 10))).resolves.toBeDefined()
      }
    })

    it('gives the list every match, and the page the total', async () => {
      const all = await rows<{ id: number }>(matchingJobIdsSql(await search('astrocyte'), NOW, 100))
      expect(all.map((row) => row.id).sort()).toEqual([ids.phd, ids.postdoc, ids.engineer].sort())
      const capped = await rows<{ id: number }>(
        matchingJobIdsSql(await search('astrocyte'), NOW, 2),
      )
      expect(capped).toHaveLength(2)
      const top = await rows<{ id: number; total: number }>(
        rankedJobsSql(await search('astrocyte'), NOW, 1),
      )
      expect(top).toEqual([{ id: ids.phd, total: 3 }])
    })

    it('finds open positions by the labels of their subfields, methods and model systems', async () => {
      // In the postdoc's title (ranked first) and in the manager's tags.
      expect(await jobs('glial biology')).toEqual([ids.postdoc, ids.manager])
      expect(await jobs('zebrafish')).toEqual([ids.manager])
      expect(await jobs('ELECTROPHYSIOLOGY')).toEqual([ids.manager])
      // With words from elsewhere: the institution's name, the title.
      expect(await jobs('geneve zebrafish')).toEqual([ids.manager])
      expect(await jobs('laboratory manager glial')).toEqual([ids.manager])
      // The prefix of the last word; a word in the title ranks above the same word in a tag.
      expect(await jobs('glia')).toEqual([ids.postdoc, ids.manager])
      // A phrase lies within one label, never across two.
      expect(await jobs('"systems and circuits"')).toEqual([ids.manager])
      expect(await jobs('"biology systems"')).toEqual([])
      expect(await jobs('"circuits electrophysiology"')).toEqual([])
      // Words that are in no tag, title, summary or institution find nothing.
      expect(await jobs('zebrafish karolinska')).toEqual([])
    })

    it("uses the full-text index for the job's own words", async () => {
      const plan = await explain(
        sql`select j.id from jobs j where to_tsvector('simple', public.f_unaccent(lower(replace(j.title || ' ' || coalesce(j.summary, ''), '/', ' ')))) @@ ${tsQuery(await search('astro'))}`,
      )
      expect(plan).toContain('jobs_fulltext_idx')
      // The query as sql.ts builds it.
      expect(await explain(rankedJobsSql(await search('astro'), NOW, 10))).toContain(
        'jobs_fulltext_idx',
      )
    })
  })

  describe('institutions', () => {
    it('folds Turkish i and accents in names and aliases', async () => {
      for (const q of ['İstanbul', 'istanbul', 'ISTANBUL', 'Istanbul', 'ıstanbul']) {
        expect((await institutions(q))[0], q).toBe('İstanbul Üniversitesi')
      }
      expect(await institutions('universitesi istanbul')).toEqual(['İstanbul Üniversitesi'])
      expect(await institutions('geneve')).toEqual(['Université de Genève'])
      expect(await institutions('university of geneva')).toEqual(['Université de Genève'])
      expect(await institutions('planck hirnforschung')).toEqual([
        'Max-Planck-Institut für Hirnforschung',
      ])
    })

    it('does not need the words that are left out, a phrase included', async () => {
      expect(await institutions('karolinska -"university hospital"')).toEqual([
        'Karolinska Institutet',
      ])
      expect(await institutions('karolinska –hospital')).toEqual(['Karolinska Institutet'])
      expect(await institutions('karolinska "or" hospital')).toEqual([])
    })

    it('lists those with open positions first, inactive last, never withdrawn ones', async () => {
      const rowsFor = await rows<{ name: string; open_jobs: number; total: number }>(
        institutionsSql(await search('istanbul'), NOW, 'en', 10),
      )
      expect(rowsFor.map((row) => [row.name, row.open_jobs, row.total])).toEqual([
        ['İstanbul Üniversitesi', 1, 2],
        ['İstanbul Closed Institute', 0, 2],
      ])
    })

    it('needs a word of three characters for the trigram index', async () => {
      expect(canMatchInstitutions(await search('KI'))).toBe(false)
      expect(canMatchInstitutions(await search('KI Solna'))).toBe(true)
      const plan = await explain(institutionsSql(await search('karolinska'), NOW, 'en', 10))
      expect(plan).toContain('institutions_name_trgm_idx')
      expect(plan).toContain('institutions_texts_aliases_trgm_idx')
    })
  })

  describe('subfields', () => {
    const subfields = async (q: string) =>
      (await rows<{ slug: string }>(subfieldsSql(await search(q), 'en', 5))).map((row) => row.slug)

    it('finds active subfields by label and synonyms', async () => {
      expect(await subfields('glia')).toEqual(['glia'])
      expect(await subfields('GLİAL')).toEqual(['glia'])
      expect(await subfields('microglia')).toEqual(['glia'])
      expect(await subfields('no such subfield')).toEqual([])
      expect(await subfields('glia -"basal ganglia"')).toEqual(['glia'])
    })
  })

  /** The query plan, with sequential scans discouraged: the tables here are tiny. */
  async function explain(query: SQL): Promise<string> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`)
      const plan = await tx.execute(sql`explain ${query}`)
      return plan.rows.map((row) => Object.values(row).join('')).join('\n')
    })
  }
})
