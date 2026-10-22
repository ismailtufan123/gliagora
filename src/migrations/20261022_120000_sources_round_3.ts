import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SEVERAL_SITES, TO_MANUAL, WEEKLY } from './data/sources-2026-10-22'

// M7's third round (src/migrations/data/sources-2026-10-22.ts): Hacettepe's institute and Üsküdar
// looked at weekly, UC Irvine, the Instituto Santos Dumont's news feed and Gazi University's NÖROM
// manual, and the shared boards whose postings are at several sites marked. Matched by address, as
// the earlier seeds wrote them; plain SQL against the tables as they are now. A raw-SQL update
// skips the source's hook, so the flag it would clear for a source that is no longer automatic is
// cleared here.

const note = (text: string) => `${text}\n`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const url of WEEKLY.urls) {
    await db.execute(sql`
      update sources set schedule = 'weekly', notes = ${note(WEEKLY.note)} || coalesce(notes, ''),
        updated_at = now()
      where url = ${url} and kind = 'manual'`)
  }
  for (const source of TO_MANUAL) {
    await db.execute(sql`
      update sources set kind = 'manual', active = false, schedule = 'weekly',
        needs_attention = false, attention_reason = null, consecutive_failures = 0,
        notes = ${note(source.note)} || coalesce(notes, ''), updated_at = now()
      where url = ${source.url} and kind in ('page', 'rss', 'sitemap')`)
  }
  for (const { url, patternHas } of SEVERAL_SITES.sources) {
    await db.execute(sql`
      update sources set several_sites = true,
        notes = ${note(SEVERAL_SITES.note)} || coalesce(notes, ''), updated_at = now()
      where url = ${url} and several_sites = false
        and (${patternHas}::text is null or strpos(coalesce(posting_pattern, ''), ${patternHas}) > 0)`)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { url } of SEVERAL_SITES.sources) {
    await db.execute(sql`
      update sources set several_sites = false,
        notes = replace(notes, ${note(SEVERAL_SITES.note)}, ''), updated_at = now()
      where url = ${url}`)
  }
  const kinds: Record<string, string> = {
    'https://recruit.ap.uci.edu/apply': 'page',
    'https://institutosantosdumont.org.br/Not%C3%ADcias/oportunidades/feed/': 'rss',
    'https://norom.gazi.edu.tr/view/announcement-list/1?Type=1': 'page',
  }
  for (const source of TO_MANUAL) {
    await db.execute(sql`
      update sources set kind = ${kinds[source.url]!}, schedule = 'daily',
        notes = replace(notes, ${note(source.note)}, ''), updated_at = now()
      where url = ${source.url} and kind = 'manual'`)
  }
  for (const url of WEEKLY.urls) {
    await db.execute(sql`
      update sources set schedule = 'monthly', notes = replace(notes, ${note(WEEKLY.note)}, ''),
        updated_at = now()
      where url = ${url} and kind = 'manual'`)
  }
}
