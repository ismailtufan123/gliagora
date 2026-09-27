import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { TAXONOMY_2026_09 } from './data/taxonomy-2026-09'

// Inserts the initial taxonomy (PLAN §4.2–4.7) in English. Plain SQL against the tables of the
// previous migration keeps this working after the Terms collection changes; later terms are
// added in the admin, where every change is kept as a version.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const position = new Map<string, number>()
  for (const term of TAXONOMY_2026_09) {
    const index = (position.get(term.vocabulary) ?? 0) + 1
    position.set(term.vocabulary, index)
    const parent = term.parent
      ? sql`(select id from terms where vocabulary = ${term.vocabulary} and slug = ${term.parent})`
      : sql`null`
    const inserted = await db.execute<{ id: number }>(sql`
      insert into terms (vocabulary, slug, parent_id, "group", is_active, sort_order)
      values (${term.vocabulary}, ${term.slug}, ${parent}, ${term.group ?? null}, true, ${index * 10})
      returning id`)
    const id = inserted.rows[0]?.id
    if (id == null) throw new Error(`Could not insert term ${term.vocabulary}/${term.slug}`)
    await db.execute(sql`
      insert into terms_locales (label, description, _locale, _parent_id)
      values (${term.label}, ${term.description}, 'en', ${id})`)
    for (const [order, synonym] of term.synonyms.entries()) {
      await db.execute(sql`
        insert into terms_texts ("order", parent_id, path, text)
        values (${order + 1}, ${id}, 'synonyms', ${synonym})`)
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Children first, so no parent is removed while a seeded child still points to it.
  for (const term of [...TAXONOMY_2026_09].reverse()) {
    await db.execute(sql`
      delete from terms where vocabulary = ${term.vocabulary} and slug = ${term.slug}`)
  }
}
