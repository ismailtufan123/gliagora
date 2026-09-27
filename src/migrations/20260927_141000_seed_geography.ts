import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { COUNTRIES_2026_09, COUNTRY_SETS_2026_09 } from './data/geography-2026-09'

// Inserts the countries with their UN M49 regions and names in English and Turkish, and the four
// country sets of PLAN §4.6, each with a first version so that its entered state can be compared
// and restored in the admin. Plain SQL against the tables of the previous migration keeps this
// working after the collections change; later changes are made in the admin.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const country of COUNTRIES_2026_09) {
    await db.execute(sql`
      insert into countries (id, region, subregion, m49_code)
      values (${country.code}, ${country.region}, ${country.subregion}, ${country.m49Code})`)
    for (const locale of ['en', 'tr'] as const) {
      await db.execute(sql`
        insert into countries_locales (name, _locale, _parent_id)
        values (${country.name[locale]}, ${locale}, ${country.code})`)
    }
  }
  for (const set of COUNTRY_SETS_2026_09) {
    const inserted = await db.execute<{ id: number }>(sql`
      insert into country_sets (slug, source_url, last_verified_at, verification_note)
      values (${set.slug}, ${set.sourceUrl}, ${`${set.lastVerifiedAt}T00:00:00.000Z`}, ${set.verificationNote})
      returning id`)
    const id = inserted.rows[0]?.id
    if (id == null) throw new Error(`Could not insert country set ${set.slug}`)
    await db.execute(sql`
      insert into country_sets_locales (label, description, _locale, _parent_id)
      values (${set.label}, ${set.description}, 'en', ${id})`)
    for (const [order, code] of set.countries.entries()) {
      await db.execute(sql`
        insert into country_sets_rels ("order", parent_id, path, countries_id)
        values (${order + 1}, ${id}, 'countries', ${code})`)
    }

    const version = await db.execute<{ id: number }>(sql`
      insert into _country_sets_v (parent_id, version_slug, version_source_url,
        version_last_verified_at, version_verification_note, version_updated_at, version_created_at)
      values (${id}, ${set.slug}, ${set.sourceUrl}, ${`${set.lastVerifiedAt}T00:00:00.000Z`},
        ${set.verificationNote}, now(), now())
      returning id`)
    const versionId = version.rows[0]?.id
    if (versionId == null) throw new Error(`Could not version country set ${set.slug}`)
    await db.execute(sql`
      insert into _country_sets_v_locales (version_label, version_description, _locale, _parent_id)
      values (${set.label}, ${set.description}, 'en', ${versionId})`)
    for (const [order, code] of set.countries.entries()) {
      await db.execute(sql`
        insert into _country_sets_v_rels ("order", parent_id, path, countries_id)
        values (${order + 1}, ${versionId}, 'version.countries', ${code})`)
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Versions point to their set with ON DELETE SET NULL, so they are removed explicitly.
  for (const set of COUNTRY_SETS_2026_09) {
    await db.execute(sql`
      delete from _country_sets_v where parent_id in (
        select id from country_sets where slug = ${set.slug})`)
    await db.execute(sql`delete from country_sets where slug = ${set.slug}`)
  }
  for (const country of COUNTRIES_2026_09) {
    await db.execute(sql`delete from countries where id = ${country.code}`)
  }
}
