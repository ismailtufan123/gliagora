import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SUBFIELD_INTRODUCTIONS_2026_10 } from './data/subfield-introductions-2026-10'

// Fills each subfield's "AI draft of the introduction" (D53) with the English draft of 2026-10, where
// that field is still empty, so the drafts arrive with an ordinary deploy and an editor's own text
// is never replaced. Plain SQL against the columns of 20261017_113022_subfield_intro_drafts keeps
// this working after the Terms collection changes. Nothing else changes: "Hub introduction", which
// the hub shows and indexing counts, stays as it is (empty until the editor writes it), and no
// version is added (the editor's next save makes one).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { slug, text } of SUBFIELD_INTRODUCTIONS_2026_10) {
    await db.execute(sql`
      update terms_locales l set hub_intro_draft = ${text}
      from terms t
      where l._parent_id = t.id and l._locale = 'en'
        and t.vocabulary = 'subfield' and t.slug = ${slug}
        and coalesce(l.hub_intro_draft, '') = ''`)
  }
}

// Empties only the drafts that are still exactly as this migration wrote them.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { slug, text } of SUBFIELD_INTRODUCTIONS_2026_10) {
    await db.execute(sql`
      update terms_locales l set hub_intro_draft = null
      from terms t
      where l._parent_id = t.id and l._locale = 'en'
        and t.vocabulary = 'subfield' and t.slug = ${slug}
        and l.hub_intro_draft = ${text}`)
  }
}
