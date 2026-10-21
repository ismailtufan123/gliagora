import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SOURCES_2026_10, TERMS_CHECKED_ON } from './data/sources-2026-10'
import { DUKE_NUS, SOURCES_2026_10_17, TERMS_CHECKED_ON_ROUND_2 } from './data/sources-2026-10-17'
import {
  ALLEN,
  ALL_NEUROSCIENCE,
  CHANGES_CHECKED_ON,
  ELSC,
  FIREWALLED,
  LEFT_OUT,
  NEW_MANUAL,
  SISSA,
  STANFORD,
  TERMS_READ,
  UBC,
  UCSF,
} from './data/sources-2026-10-21'

// M7's second round, from the report on the first four daily runs (2026-10-18 to 2026-10-21) and
// the operator's decisions on terms of 2026-10-18 (src/migrations/data/sources-2026-10-21.ts):
// NUS and Duke-NUS left out (deep links forbidden), UCSF manual (UC's "one copy for personal
// use"), the Crick and Koç University manual (their firewall refuses the monitor), SISSA's
// neuroscience list and the lists of whole neuroscience institutes kept whole, the Allen Institute's standing paragraphs not counted, Stanford's
// five postings that the first round's code checked by the wrong title read again, ELSC noted as
// unreachable from the server too, the terms the operator read as allowing our use noted on their
// sources (Baylor, NTU, Aga Khan, Cinvestav, Glasgow, Basel, Gothenburg; UBC stays manual), and the
// new manual sources (UC San Diego, Hacettepe's institute, Üsküdar, Sabancı). Matched by address, as the earlier seeds wrote them; plain SQL against the
// tables as they are now. A raw-SQL update skips the source's hook, so the flag it would clear for
// a source that is no longer automatic is cleared here.

const note = (text: string) => `${text}\n`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const checked = `${CHANGES_CHECKED_ON}T12:00:00.000Z`
  await db.execute(sql`
    update sources set kind = 'left-out', active = false, terms_url = ${LEFT_OUT.termsUrl},
      terms_checked_at = ${`${LEFT_OUT.termsCheckedOn}T12:00:00.000Z`},
      terms_note = ${LEFT_OUT.termsNote}, needs_attention = false, attention_reason = null,
      notes = ${note(LEFT_OUT.note)} || coalesce(notes, ''), updated_at = now()
    where url = ${LEFT_OUT.url} and kind = 'sitemap'`)
  for (const source of [UCSF, ...FIREWALLED]) {
    await db.execute(sql`
      update sources set kind = 'manual', active = false, schedule = 'weekly',
        needs_attention = false, attention_reason = null, consecutive_failures = 0,
        notes = ${note(source.note)} || coalesce(notes, ''), updated_at = now()
      where url = ${source.url} and kind = 'page'`)
  }
  await db.execute(sql`
    update sources set all_neuroscience = true,
      notes = ${note(SISSA.note)} || coalesce(notes, ''), updated_at = now()
    where url = ${SISSA.url} and kind = 'page'`)
  for (const url of ALL_NEUROSCIENCE.urls) {
    await db.execute(sql`
      update sources set all_neuroscience = true,
        notes = ${note(ALL_NEUROSCIENCE.note)} || coalesce(notes, ''), updated_at = now()
      where url = ${url} and all_neuroscience = false`)
  }
  await db.execute(sql`
    update sources set ignored_names = ${ALLEN.ignoredNames},
      notes = ${note(ALLEN.note)} || coalesce(notes, ''), updated_at = now()
    where url = ${ALLEN.url} and ignored_names is null`)
  // Read again on the next run: the first round's code checked them by the page's own title.
  await db.execute(sql`
    delete from source_postings
    where source_id in (select id from sources where url = ${STANFORD.url})
      and outcome = 'not-neuroscience' and first_seen_at < ${STANFORD.before}`)
  await db.execute(sql`
    update sources set notes = ${note(ELSC.note)} || coalesce(notes, ''), updated_at = now()
    where url = ${ELSC.url} and kind = 'manual'`)
  for (const source of TERMS_READ.sources) {
    await db.execute(sql`
      update sources set notes = ${note(`${TERMS_READ.note} ${source.why}`)} || coalesce(notes, ''),
        updated_at = now()
      where url = ${source.url} and kind <> 'manual'`)
  }
  await db.execute(sql`
    update sources set notes = ${note(UBC.note)} || coalesce(notes, ''), updated_at = now()
    where url = ${UBC.url} and kind = 'manual'`)
  for (const source of NEW_MANUAL) {
    const notes = source.rorId
      ? `${source.notes}\nROR ID of the employer: ${source.rorId}`
      : source.notes
    await db.execute(sql`
      insert into sources (name, institution_id, kind, schedule, url, active, terms_url,
        terms_automation, terms_checked_at, terms_note, notes)
      select ${source.name}, (select id from institutions where ror_id = ${source.rorId}),
        'manual', ${source.schedule}, ${source.url}, false, ${source.termsUrl},
        ${source.termsAutomation}, ${checked}, ${source.termsNote}, ${notes}
      where not exists (select 1 from sources where name = ${source.name} and url = ${source.url})`)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const source of NEW_MANUAL) {
    await db.execute(sql`
      delete from sources where name = ${source.name} and url = ${source.url} and kind = 'manual'`)
  }
  await db.execute(sql`
    update sources set notes = replace(coalesce(notes, ''), ${note(ELSC.note)}, ''), updated_at = now()
    where url = ${ELSC.url}`)
  await db.execute(sql`
    update sources set notes = replace(coalesce(notes, ''), ${note(UBC.note)}, ''), updated_at = now()
    where url = ${UBC.url}`)
  for (const source of TERMS_READ.sources) {
    await db.execute(sql`
      update sources set notes = replace(coalesce(notes, ''), ${note(`${TERMS_READ.note} ${source.why}`)}, ''),
        updated_at = now()
      where url = ${source.url}`)
  }
  await db.execute(sql`
    update sources set ignored_names = null,
      notes = replace(coalesce(notes, ''), ${note(ALLEN.note)}, ''), updated_at = now()
    where url = ${ALLEN.url} and ignored_names = ${ALLEN.ignoredNames}`)
  await db.execute(sql`
    update sources set all_neuroscience = false,
      notes = replace(coalesce(notes, ''), ${note(SISSA.note)}, ''), updated_at = now()
    where url = ${SISSA.url}`)
  for (const url of ALL_NEUROSCIENCE.urls) {
    await db.execute(sql`
      update sources set all_neuroscience = false,
        notes = replace(coalesce(notes, ''), ${note(ALL_NEUROSCIENCE.note)}, ''), updated_at = now()
      where url = ${url} and notes like ${`${ALL_NEUROSCIENCE.note}%`}`)
  }
  for (const source of [UCSF, ...FIREWALLED]) {
    await db.execute(sql`
      update sources set kind = 'page', active = false, schedule = 'daily',
        notes = replace(coalesce(notes, ''), ${note(source.note)}, ''), updated_at = now()
      where url = ${source.url} and kind = 'manual'`)
  }
  // NUS and Duke-NUS: back to the kind and terms their seeds gave them.
  const nus = SOURCES_2026_10_17.find((source) => source.url === LEFT_OUT.url)
  const dukeSeed = SOURCES_2026_10.find((source) => source.url === DUKE_NUS.from)
  for (const [pattern, terms, checkedOn] of [
    [nus?.postingPattern, nus, TERMS_CHECKED_ON_ROUND_2],
    [DUKE_NUS.postingPattern, dukeSeed, TERMS_CHECKED_ON],
  ] as const) {
    await db.execute(sql`
      update sources set kind = 'sitemap', active = false, terms_url = ${terms?.termsUrl ?? null},
        terms_note = ${terms?.termsNote ?? null}, terms_checked_at = ${`${checkedOn}T12:00:00.000Z`},
        notes = replace(coalesce(notes, ''), ${note(LEFT_OUT.note)}, ''), updated_at = now()
      where url = ${LEFT_OUT.url} and kind = 'left-out' and posting_pattern = ${pattern ?? ''}`)
  }
}
