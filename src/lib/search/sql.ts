import { sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'

import type { Search } from './parse'

// The search queries (PLAN §3.2) as SQL, built with Drizzle's `sql` tag: every value, and above
// all the words people type, is a query parameter, never part of the SQL text (sql.test.ts checks
// this). Pure, so the queries can be read and tested without a database; database.ts runs them.
//
// The expressions below repeat those of the indexes in src/migrations/20260928_100000_search.ts
// character for character, or PostgreSQL cannot use the indexes; search.db.test.ts checks the
// query plans against a database.

/**
 * Text folded for full-text search: lower case, accents and Turkish dotless/dotted i folded by
 * unaccent, and a slash read as a space ("MSc/PhD" is two words).
 */
const foldText = (value: SQL) => sql`public.f_unaccent(lower(replace(${value}, '/', ' ')))`

/** Names folded for trigram matching, as in the institution indexes. */
const foldName = (value: SQL) => sql`public.f_unaccent(lower(${value}))`

/** A job's own words: the expression of the jobs_fulltext_idx index. */
const JOB_TEXT = sql`to_tsvector('simple', public.f_unaccent(lower(replace(j.title || ' ' || coalesce(j.summary, ''), '/', ' '))))`

/**
 * A one-word gap between the parts of a document: `||` places the words of its right side after
 * the last position of its left, so without a gap the title's last word and the institution's
 * first would be neighbours, and a phrase could run from one into the other. The gap is a lexeme
 * of a single space, which the parser never makes from text; ts_delete removes it again.
 */
const GAP = sql`''' '':1'::tsvector`

/**
 * The tags a position is found by besides its own words (D56): its subfields, methods and model
 * systems, by their English labels, as the pages show them ("glial biology" finds the positions
 * tagged Glial biology). Paths of the `jobs_rels` table.
 */
const TAG_PATHS = sql`('subfields', 'methods', 'modelSystems')`
const TAG_LOCALE = 'en'

/**
 * A word between two labels in a position's tags, so that a phrase cannot run from one label into
 * the next; removed from the document again (ts_delete), leaving the gap in the positions. The
 * parser makes it a lexeme of its own, which no label holds.
 */
const TAG_SEPARATOR = 'gliagoratagseparator'

/** A position's tag labels, separated (the parts of its document's tags). */
const jobTags = (job: SQL) => sql`(
  SELECT string_agg(l.label, ${` ${TAG_SEPARATOR} `}::text ORDER BY r."order", r.id)
  FROM jobs_rels r
  JOIN terms_locales l ON l._parent_id = r.terms_id AND l._locale = ${TAG_LOCALE}
  WHERE r.parent_id = ${job} AND r.path IN ${TAG_PATHS})`

/**
 * What a position is found and ranked by: its title (weight A), its institution's name (B), its
 * tags (C) and its summary (D), so a word in the title ranks higher than the same word in the
 * summary. A phrase must lie within one of them (within one tag).
 */
const JOB_DOCUMENT = sql`ts_delete(
  setweight(to_tsvector('simple', ${foldText(sql`j.title`)}), 'A')
  || ${GAP} || setweight(to_tsvector('simple', ${foldText(sql`i.name`)}), 'B')
  || ${GAP} || setweight(to_tsvector('simple', ${foldText(sql`coalesce(${jobTags(sql`j.id`)}, '')`)}), 'C')
  || ${GAP} || to_tsvector('simple', ${foldText(sql`coalesce(j.summary, '')`)}),
  ARRAY[' ', ${TAG_SEPARATOR}::text])`

/**
 * The query folded as the full-text search reads it, for parse.ts to read its words from
 * (readSearch): only the database folds, as it does for the indexes.
 */
export const foldSql = (text: string): SQL => sql`SELECT ${foldText(sql`${text}`)} AS folded`

/**
 * The query as a tsquery. websearch_to_tsquery reads any text without an error (quotes, minus
 * signs and `or` are its syntax; other punctuation is ignored). For a prefix search the last word
 * gets `:*`, added to PostgreSQL's own text of the query: that text quotes every word ('astro'),
 * so when it ends with a quote its last element is a word, and `'astro':*` is valid wherever
 * `'astro'` is. Nothing people type reaches the tsquery syntax itself.
 */
export function tsQuery(search: Search): SQL {
  const query = sql`websearch_to_tsquery('simple', ${foldText(sql`${search.text}`)})`
  if (!search.prefix) return query
  return sql`(CASE WHEN ${query}::text LIKE '%''' THEN (${query}::text || ':*')::tsquery ELSE ${query} END)`
}

/**
 * A word for a LIKE pattern, with LIKE's own characters (backslash, % and _) escaped; chr(92) is a
 * backslash. The words come folded already (parse.ts reads them from the database's fold of the
 * query, foldSql), and are not folded again: folding twice can differ from folding once ("℃" folds
 * to "°C", which folds to "°c"), and the names are folded once.
 */
const likeWord = (word: string) =>
  sql`replace(replace(replace(${word}::text, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_')`

/** The word appears somewhere in the folded name: what the trigram index can find. */
const containsWord = (name: SQL, word: string) =>
  sql`${foldName(name)} LIKE '%' || ${likeWord(word)} || '%'`

/**
 * The word starts a word of the name ("glia" finds "Glial biology", not "basal ganglia"; "planck"
 * finds "Max-Planck-Institut"): the folded name with every run of other characters as one space,
 * after a leading space, contains a space and the word. Checked only on what the index found.
 */
const startsWord = (name: SQL, word: string) =>
  sql`' ' || regexp_replace(${foldName(name)}, '[^[:alnum:]]+', ' ', 'g') LIKE '% ' || ${likeWord(word)} || '%'`

/** Every word starts a word of the name (one LIKE each, so the trigram index can combine them). */
const allWordsIn = (name: SQL, words: readonly string[]) =>
  sql.join(
    words.map((word) => sql`${containsWord(name, word)} AND ${startsWord(name, word)}`),
    sql` AND `,
  )

/** At least one word appears in the name: a cheap first check, never narrower than the search. */
const anyWordIn = (name: SQL, words: readonly string[]) =>
  words.length === 0
    ? sql`false`
    : sql.join(
        words.map((word) => containsWord(name, word)),
        sql` OR `,
      )

/**
 * Open jobs (PLAN §2.5), as `openJobsWhere` in src/lib/jobs/query.ts: published, and before the
 * end of the deadline day when the deadline is fixed. `now` is the request time, so the search
 * agrees with the list it is combined with.
 */
const openJob = (now: Date) =>
  sql`j.status = 'published' AND (j.deadline_kind <> 'fixed' OR j.deadline_at > ${now.toISOString()})`

/**
 * The open positions that match: every word of the query in the title, the summary, the
 * institution's name or the tags (a word may be in any of them: "postdoc karolinska", "phd glial
 * biology"). Three cheap ways in find every candidate, and the full check keeps the matches:
 * - the job's own words match the query: the full-text index finds these;
 * - the institution's name contains one of the words: only open jobs are read for these;
 * - one of its tags' labels contains one of the words: the matching terms are few (about 120 in
 *   all), and their jobs are found by the index on `jobs_rels.terms_id`.
 * A job that matches only thanks to its institution's name or its tags has a word of the query in
 * that name or label, so the second or third way finds it: they look for every word (allWords),
 * not only the first eight that institutions are matched by. Only the candidates' documents are
 * built.
 */
function matchingJobs(search: Search, now: Date) {
  const query = tsQuery(search)
  return sql`
    candidates AS (
      SELECT j.id FROM jobs j
      WHERE ${openJob(now)} AND ${JOB_TEXT} @@ ${query}
      UNION
      SELECT j.id FROM jobs j JOIN institutions i ON i.id = j.institution_id
      WHERE ${openJob(now)} AND (${anyWordIn(sql`i.name`, search.allWords)})
      UNION
      SELECT j.id FROM terms_locales l
      JOIN jobs_rels r ON r.terms_id = l._parent_id AND r.path IN ${TAG_PATHS}
      JOIN jobs j ON j.id = r.parent_id
      WHERE l._locale = ${TAG_LOCALE} AND ${openJob(now)}
        AND (${anyWordIn(sql`l.label`, search.allWords)})
    ),
    matches AS (
      SELECT j.id, j.deadline_at, j.published_at, d.document
      FROM candidates c
      JOIN jobs j ON j.id = c.id
      JOIN institutions i ON i.id = j.institution_id
      -- OFFSET 0 builds each document once, for the check and the ranking.
      CROSS JOIN LATERAL (SELECT ${JOB_DOCUMENT} AS document OFFSET 0) d
      WHERE d.document @@ ${query}
    )`
}

/**
 * The best `limit` open positions for the search page, with the number of all matches: the most
 * relevant first (ts_rank), then the nearest deadline, as the list orders them.
 */
export function rankedJobsSql(search: Search, now: Date, limit: number): SQL {
  return sql`
    WITH ${matchingJobs(search, now)}
    SELECT id, (count(*) OVER ())::int AS total
    FROM matches
    ORDER BY ts_rank(document, ${tsQuery(search)}) DESC, deadline_at ASC NULLS LAST,
      published_at DESC NULLS LAST, id DESC
    LIMIT ${limit}`
}

/** The IDs of all open positions that match, for the jobs list's `q` filter; at most `cap`. */
export function matchingJobIdsSql(search: Search, now: Date, cap: number): SQL {
  return sql`
    WITH ${matchingJobs(search, now)}
    SELECT id FROM matches ORDER BY id LIMIT ${cap}`
}

/**
 * Institutions whose name, or one of whose aliases (other names, acronyms, names in other
 * languages), has a word starting with each word of the search, with the number of matches. Those with open positions first,
 * then active before inactive ones, then the closest names (trigram similarity), then by name.
 * Withdrawn ROR records are left out. Needs a word of three letters or digits
 * (canMatchInstitutions in parse.ts). The one query whose work grows with the data (a common
 * word finds thousands of names), so database.ts runs it with a time limit.
 */
export function institutionsSql(search: Search, now: Date, locale: string, limit: number): SQL {
  const words = search.words
  const phrase = sql`${words.join(' ')}::text`
  const order = sql`(o.n IS NOT NULL) DESC, (i.status = 'active') DESC, b.score DESC, i.name, i.id`
  return sql`
    WITH matched AS (
      SELECT i.id, similarity(${foldName(sql`i.name`)}, ${phrase}) AS score
      FROM institutions i
      WHERE ${allWordsIn(sql`i.name`, words)}
      UNION ALL
      SELECT t.parent_id, similarity(${foldName(sql`t.text`)}, ${phrase})
      FROM institutions_texts t
      WHERE t.path = 'aliases' AND ${allWordsIn(sql`t.text`, words)}
    ),
    best AS (SELECT id, max(score) AS score FROM matched GROUP BY id),
    open_jobs AS (
      SELECT j.institution_id, count(*)::int AS n FROM jobs j
      WHERE ${openJob(now)} GROUP BY j.institution_id
    ),
    ranked AS (
      SELECT i.id, i.name, i.slug, i.ror_id, i.short_id, i.city, i.country_id,
        coalesce(o.n, 0) AS open_jobs,
        (count(*) OVER ())::int AS total,
        row_number() OVER (ORDER BY ${order}) AS position
      FROM best b
      JOIN institutions i ON i.id = b.id
      LEFT JOIN open_jobs o ON o.institution_id = i.id
      WHERE i.status <> 'withdrawn'
      ORDER BY ${order}
      LIMIT ${limit}
    )
    SELECT r.id, r.name, r.slug, r.ror_id, r.short_id, r.city, c.name AS country, r.open_jobs,
      r.total
    FROM ranked r
    LEFT JOIN countries_locales c ON c._parent_id = r.country_id AND c._locale = ${locale}
    ORDER BY r.position`
}

/**
 * Active subfields whose label, or one of whose synonyms, has a word starting with each word of
 * the search, with the number of matches: label matches first, then in the taxonomy's order. Terms are few (117), so they need
 * no index. Unset `isActive` counts as active, as in src/lib/detail-lookup.ts.
 */
export function subfieldsSql(search: Search, locale: string, limit: number): SQL {
  const inLabel = allWordsIn(sql`l.label`, search.words)
  return sql`
    SELECT t.id, t.slug, l.label, l.description, (count(*) OVER ())::int AS total
    FROM terms t
    JOIN terms_locales l ON l._parent_id = t.id AND l._locale = ${locale}
    WHERE t.vocabulary = 'subfield' AND t.is_active IS DISTINCT FROM false
      AND ((${inLabel}) OR EXISTS (
        SELECT 1 FROM terms_texts s
        WHERE s.parent_id = t.id AND s.path = 'synonyms' AND ${allWordsIn(sql`s.text`, search.words)}
      ))
    ORDER BY (${inLabel}) DESC, t.sort_order, t.id
    LIMIT ${limit}`
}
