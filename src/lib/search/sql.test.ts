import { readFileSync } from 'node:fs'

import { PgDialect } from '@payloadcms/db-postgres/drizzle/pg-core'
import { describe, expect, it } from 'vitest'

import { readSearch, searchText } from './parse'
import {
  foldSql,
  institutionsSql,
  matchingJobIdsSql,
  rankedJobsSql,
  subfieldsSql,
  tsQuery,
} from './sql'

const dialect = new PgDialect()
const NOW = new Date('2026-10-01T12:00:00.000Z')

/** The search for `q`, with lower case standing in for the database's fold. */
const parseSearch = (q: string) => {
  const text = searchText(q)
  return text ? readSearch(text, text.toLowerCase()) : null
}

const HOSTILE = [
  "'); DROP TABLE jobs; --",
  '100% _match_ \\ back\\slash',
  "astro' || ':*",
  '$1 $$ :* <-> & | !',
  'İstanbul "Robert\'); DELETE FROM institutions; --"',
]

describe('search SQL', () => {
  it('passes what people type as parameters only, never as SQL text', () => {
    for (const q of HOSTILE) {
      const search = parseSearch(q)!
      const fold = dialect.sqlToQuery(foldSql(search.text))
      expect(fold.params).toEqual([search.text])
      expect(fold.sql).toBe("SELECT public.f_unaccent(lower(replace($1, '/', ' '))) AS folded")
      for (const query of [
        rankedJobsSql(search, NOW, 10),
        matchingJobIdsSql(search, NOW, 100),
        institutionsSql(search, NOW, 'en', 10),
        subfieldsSql(search, 'en', 5),
      ]) {
        const { sql, params } = dialect.sqlToQuery(query)
        expect(params).toEqual(expect.arrayContaining(search.words))
        expect(sql).not.toContain(search.text)
        for (const fragment of ['DROP', 'DELETE', 'Robert', '100%', 'back\\slash']) {
          expect(sql).not.toContain(fragment)
        }
      }
    }
  })

  it('adds the prefix marker only for a prefix search', () => {
    expect(dialect.sqlToQuery(tsQuery(parseSearch('astro')!)).sql).toContain(":*'")
    expect(dialect.sqlToQuery(tsQuery(parseSearch('as')!)).sql).not.toContain(':*')
    expect(dialect.sqlToQuery(tsQuery(parseSearch('as')!)).sql).toBe(
      "websearch_to_tsquery('simple', public.f_unaccent(lower(replace($1, '/', ' '))))",
    )
  })

  it("repeats the migration's index expressions exactly", () => {
    const migration = readFileSync(
      new URL('../../migrations/20260928_100000_search.ts', import.meta.url),
      'utf8',
    ).replace(/\s+/g, ' ')
    const jobs = dialect
      .sqlToQuery(rankedJobsSql(parseSearch('astro')!, NOW, 10))
      .sql.match(
        /to_tsvector\('simple', public\.f_unaccent\(lower\(replace\(j\.title .*?\)\)\)\)/,
      )?.[0]
    expect(jobs).toBeDefined()
    expect(migration).toContain(jobs!.replaceAll('j.', ''))
    const institutions = dialect.sqlToQuery(
      institutionsSql(parseSearch('karolinska')!, NOW, 'en', 10),
    ).sql
    expect(institutions).toContain('public.f_unaccent(lower(i.name)) LIKE')
    expect(institutions).toContain('public.f_unaccent(lower(t.text)) LIKE')
    expect(institutions).toContain("t.path = 'aliases'")
    expect(migration).toContain('public.f_unaccent(lower(name)) public.gin_trgm_ops')
    expect(migration).toContain(
      "public.f_unaccent(lower(text)) public.gin_trgm_ops) WHERE path = 'aliases'",
    )
  })

  it('reads open positions by the request time, as a parameter', () => {
    const { sql, params } = dialect.sqlToQuery(rankedJobsSql(parseSearch('glia')!, NOW, 10))
    expect(sql).toContain(
      "j.status = 'published' AND (j.deadline_kind <> 'fixed' OR j.deadline_at > $",
    )
    expect(params).toContain(NOW.toISOString())
    expect(sql).not.toContain('now()')
  })
})
