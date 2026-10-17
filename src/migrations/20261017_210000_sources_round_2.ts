import { createHash } from 'node:crypto'

import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SOURCES_2026_10 } from './data/sources-2026-10'
import {
  DUKE_NUS,
  MONTHLY_URLS,
  SOURCES_2026_10_17,
  TERMS_CHECKED_ON_ROUND_2,
} from './data/sources-2026-10-17'

// M7's second round (2026-10-17): the new employers' sources (src/migrations/data/
// sources-2026-10-17.ts), each with "Monitor on" unticked until its run by hand; Duke-NUS read
// through the NUS sitemap; and the manual sources whose lists rarely change looked at monthly.
// Each institution is found by its ROR ID, as in 20261016_120000_seed_sources (where it is missing,
// the source has none and its notes name the ID). Plain SQL against the tables as they are now.
/** An array row's ID, as Payload makes them: 24 hex characters. */
const rowId = (id: number, url: string) =>
  createHash('sha256').update(`${id} ${url}`).digest('hex').slice(0, 24)

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const checked = `${TERMS_CHECKED_ON_ROUND_2}T12:00:00.000Z`
  for (const source of SOURCES_2026_10_17) {
    const notes = source.rorId
      ? `${source.notes}\nROR ID of the employer: ${source.rorId}`
      : source.notes
    const inserted = await db.execute<{ id: number }>(sql`
      insert into sources (name, institution_id, kind, api_format, schedule, url, posting_pattern,
        all_neuroscience, active, terms_url, terms_automation, terms_checked_at, terms_note, notes)
      select ${source.name}, (select id from institutions where ror_id = ${source.rorId}),
        ${source.kind}, ${source.apiFormat}, ${source.schedule}, ${source.url},
        ${source.postingPattern}, ${source.allNeuroscience}, false, ${source.termsUrl},
        ${source.termsAutomation}, ${checked}, ${source.termsNote}, ${notes}
      where not exists (select 1 from sources where name = ${source.name} and url = ${source.url})
      returning id`)
    const id = inserted.rows[0]?.id
    for (const [order, url] of source.moreUrls.entries()) {
      if (id === undefined) break
      await db.execute(sql`
        insert into sources_more_urls (_order, _parent_id, id, url)
        values (${order + 1}, ${id}, ${rowId(id, url)}, ${url})`)
    }
  }
  await db.execute(sql`
    update sources set name = ${DUKE_NUS.name}, kind = 'sitemap', url = ${DUKE_NUS.url},
      posting_pattern = ${DUKE_NUS.postingPattern}, schedule = 'daily', active = false,
      notes = ${`${DUKE_NUS.note}\n`} || coalesce(notes, ''), updated_at = now()
    where url = ${DUKE_NUS.from} and kind = 'manual'`)
  for (const url of MONTHLY_URLS) {
    await db.execute(sql`
      update sources set schedule = 'monthly', updated_at = now()
      where url = ${url} and kind = 'manual' and schedule = 'weekly'`)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const url of MONTHLY_URLS) {
    await db.execute(sql`
      update sources set schedule = 'weekly', updated_at = now()
      where url = ${url} and kind = 'manual' and schedule = 'monthly'`)
  }
  const seeded = SOURCES_2026_10.find((source) => source.url === DUKE_NUS.from)
  await db.execute(sql`
    update sources set name = ${seeded?.name ?? DUKE_NUS.name}, kind = 'manual',
      url = ${DUKE_NUS.from}, posting_pattern = null, schedule = 'weekly', active = false,
      notes = replace(notes, ${`${DUKE_NUS.note}\n`}, ''), updated_at = now()
    where url = ${DUKE_NUS.url} and name = ${DUKE_NUS.name}`)
  for (const source of SOURCES_2026_10_17) {
    const match = sql`select id from sources where name = ${source.name} and url = ${source.url}`
    await db.execute(sql`delete from source_postings where source_id in (${match})`)
    await db.execute(sql`delete from source_runs where source_id in (${match})`)
    await db.execute(sql`delete from sources where id in (${match})`)
  }
}
