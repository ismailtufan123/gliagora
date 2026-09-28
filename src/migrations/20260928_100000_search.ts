import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Basic search (M4.9, PLAN §3.2): PostgreSQL full-text search over open positions, and trigram
// matching over institution names and aliases. Plain SQL, like the seed migrations. The queries
// that use these indexes are in src/lib/search/sql.ts and must repeat the indexed expressions
// exactly, or PostgreSQL cannot use the indexes (src/lib/search/search.db.test.ts checks the plans).
//
// - `unaccent` and `pg_trgm` are trusted extensions (PostgreSQL 13 and later): the owner of a
//   database may create them without being a superuser. On the server the app's role owns its
//   database (deploy/postgres/init/10-app-database.sh: CREATE DATABASE gliagora OWNER gliagora),
//   so the migration runs there as it does locally.
// - `public.f_unaccent` is the usual IMMUTABLE wrapper: `unaccent()` is only STABLE (its dictionary
//   could change), and an index expression must be IMMUTABLE. The dictionary and the function are
//   schema-qualified, so the function works whatever the search_path is: pg_dump and pg_restore,
//   autovacuum and index builds run with an empty or restricted one. It is written as a SQL-standard
//   body (RETURN …), which PostgreSQL checks when it is created and records as depending on the
//   extension.
// - Text is folded with lower() and then f_unaccent(): with the databases' libc collation
//   (en_US.utf8), lower('İ') is 'i', and unaccent turns 'ı' into 'i' and 'ü', 'ş', 'ğ', 'ç', 'ö'
//   into their base letters, so İstanbul, ISTANBUL and ıstanbul all become istanbul (PLAN §12).
//   A slash counts as a space, so "MSc/PhD" gives two words rather than one path-like token.
// - Full-text search uses the 'simple' configuration: no stemming and no stop words, because titles
//   mix languages and an English stemmer would change Turkish or German words.
// - Institutions (about 140,000 from ROR) are matched by trigrams, so a part of a name or an alias
//   finds them. Measured on the full ROR import: the name index is 12 MB and the alias index 17 MB,
//   built in about 1.5 s each; a search for a distinctive name takes 2–6 ms, a very common word
//   0.4 s ("university", 14,604 matches) to about 1 s ("uni", 31,857), which the app bounds
//   (src/lib/search/database.ts; the M4.9 note in PLAN.md). Terms (117 rows) need no index.
//
// Payload does not know these objects. `pnpm migrate:create` compares the collections with the last
// migration's .json snapshot, never with the database, and this migration has no snapshot, so later
// generated migrations neither see nor drop them. Index names avoid Payload's `<table>_<field>_idx`
// pattern, so no future field can collide with them.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

    CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
      RETURN public.unaccent('public.unaccent'::regdictionary, $1);

    CREATE INDEX jobs_fulltext_idx ON jobs USING gin (
      to_tsvector('simple', public.f_unaccent(lower(replace(title || ' ' || coalesce(summary, ''), '/', ' '))))
    );
    CREATE INDEX institutions_name_trgm_idx ON institutions
      USING gin (public.f_unaccent(lower(name)) public.gin_trgm_ops);
    CREATE INDEX institutions_texts_aliases_trgm_idx ON institutions_texts
      USING gin (public.f_unaccent(lower(text)) public.gin_trgm_ops) WHERE path = 'aliases';
  `)
}

// Drops the indexes and the function. The two extensions stay: `up` cannot tell whether it
// installed them or found them (IF NOT EXISTS), later steps may use them (the duplicate check of M7
// could use trigram similarity), and an extension that nothing uses holds no data.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS institutions_texts_aliases_trgm_idx;
    DROP INDEX IF EXISTS institutions_name_trgm_idx;
    DROP INDEX IF EXISTS jobs_fulltext_idx;
    DROP FUNCTION IF EXISTS public.f_unaccent(text);
  `)
}
