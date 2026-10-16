import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SOURCES_2026_10, TERMS_CHECKED_ON } from './data/sources-2026-10'

// Inserts the first sources (M7, D52): the 70 employers of docs/sources/initial-sources.csv, with
// sub-units' own vacancy pages, as researched on 2026-10-16. Plain SQL against the tables of
// 20261016_001728_m7_sources keeps this working after the Sources collection changes; later sources
// are added in the admin. Each institution is found by its ROR ID (the server holds the full ROR
// import; where it is missing, as in the test data, the source has none and its notes name the ID).
// "Monitor on" starts unticked: the first run is by hand, then the monitors are switched on
// (/api/ops/monitors/switch-on/, or "Monitor on" in the admin).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const checked = `${TERMS_CHECKED_ON}T12:00:00.000Z`
  for (const source of SOURCES_2026_10) {
    const notes = source.rorId ? `${source.notes}\nROR ID of the employer: ${source.rorId}` : source.notes
    await db.execute(sql`
      insert into sources (name, institution_id, kind, api_format, schedule, url, posting_pattern,
        all_neuroscience, active, terms_url, terms_automation, terms_checked_at, terms_note, notes)
      values (${source.name},
        (select id from institutions where ror_id = ${source.rorId}),
        ${source.kind}, ${source.apiFormat}, ${source.schedule}, ${source.url}, ${source.postingPattern},
        false, false, ${source.termsUrl}, ${source.termsAutomation}, ${checked}, ${source.termsNote},
        ${notes})`)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const source of SOURCES_2026_10) {
    const match = sql`select id from sources where name = ${source.name} and url = ${source.url}`
    await db.execute(sql`delete from source_postings where source_id in (${match})`)
    await db.execute(sql`delete from sources where id in (${match})`)
  }
}
