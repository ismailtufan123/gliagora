import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { TAXONOMY_2026_09 } from './data/taxonomy-2026-09'

// Inserts the initial taxonomy (PLAN §4.2–4.7) in English. Plain SQL against the tables of the
// previous migration keeps this working after the Terms collection changes; later terms are
// added in the admin, where every change is kept as a version. Each seeded term also gets a first
// version, so its seeded state can be compared and restored in the admin.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const position = new Map<string, number>()
  for (const term of TAXONOMY_2026_09) {
    const index = (position.get(term.vocabulary) ?? 0) + 1
    position.set(term.vocabulary, index)
    const parent = term.parent
      ? sql`(select id from terms where vocabulary = ${term.vocabulary} and slug = ${term.parent})`
      : sql`null`
    const inserted = await db.execute<{ id: number; parent_id: number | null }>(sql`
      insert into terms (vocabulary, slug, parent_id, "group", is_active, sort_order)
      values (${term.vocabulary}, ${term.slug}, ${parent}, ${term.group ?? null}, true, ${index * 10})
      returning id, parent_id`)
    const row = inserted.rows[0]
    if (!row) throw new Error(`Could not insert term ${term.vocabulary}/${term.slug}`)
    await db.execute(sql`
      insert into terms_locales (label, description, _locale, _parent_id)
      values (${term.label}, ${term.description}, 'en', ${row.id})`)
    for (const [order, synonym] of term.synonyms.entries()) {
      await db.execute(sql`
        insert into terms_texts ("order", parent_id, path, text)
        values (${order + 1}, ${row.id}, 'synonyms', ${synonym})`)
    }

    const version = await db.execute<{ id: number }>(sql`
      insert into _terms_v (parent_id, version_vocabulary, version_slug, version_parent_id,
        version_group, version_is_active, version_sort_order, version_updated_at, version_created_at)
      values (${row.id}, ${term.vocabulary}, ${term.slug}, ${row.parent_id}, ${term.group ?? null},
        true, ${index * 10}, now(), now())
      returning id`)
    const versionId = version.rows[0]?.id
    if (versionId == null) throw new Error(`Could not version term ${term.vocabulary}/${term.slug}`)
    await db.execute(sql`
      insert into _terms_v_locales (version_label, version_description, _locale, _parent_id)
      values (${term.label}, ${term.description}, 'en', ${versionId})`)
    for (const [order, synonym] of term.synonyms.entries()) {
      await db.execute(sql`
        insert into _terms_v_texts ("order", parent_id, path, text)
        values (${order + 1}, ${versionId}, 'version.synonyms', ${synonym})`)
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Children first, so no parent is removed while a seeded child still points to it. Versions
  // point to their term with ON DELETE SET NULL, so they are removed explicitly.
  for (const term of [...TAXONOMY_2026_09].reverse()) {
    await db.execute(sql`
      delete from _terms_v where parent_id in (
        select id from terms where vocabulary = ${term.vocabulary} and slug = ${term.slug})`)
    await db.execute(sql`
      delete from terms where vocabulary = ${term.vocabulary} and slug = ${term.slug}`)
  }
}
