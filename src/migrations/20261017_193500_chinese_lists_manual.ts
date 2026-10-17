import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// M7's second round: a list that names people in Chinese, Japanese or Korean script stays manual
// unless the employer has a list in English, since redaction cannot find such names (PLAN §6.6).
// CEBSIT's three Chinese lists name groups by their heads; its English list
// (english.cebsit.cas.cn/JOIN/) stays automatic. Their candidates are left out of AI drafts
// (`cannotRedact`). Matched by address, as the seed of 20261016_120000_seed_sources wrote them.

const LISTS = [
  'https://cebsit.cas.cn/zpxxi/yjzl/',
  'https://cebsit.cas.cn/zpxxi/bsh/',
  'https://cebsit.cas.cn/zpxxi/yjy/',
]

const NOTE =
  "Manual since M7's second round (2026-10-17): the list is in Chinese and names people (group heads) in Chinese script, which redaction cannot find; CEBSIT's English list (http://english.cebsit.cas.cn/JOIN/) is the automatic source.\n"

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const url of LISTS) {
    await db.execute(sql`
      update sources set kind = 'manual', active = false, schedule = 'weekly',
        notes = ${NOTE} || coalesce(notes, ''), updated_at = now()
      where url = ${url} and kind = 'page'`)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const url of LISTS) {
    await db.execute(sql`
      update sources set kind = 'page', active = false, schedule = 'daily',
        notes = replace(coalesce(notes, ''), ${NOTE}, ''), updated_at = now()
      where url = ${url} and kind = 'manual'`)
  }
}
