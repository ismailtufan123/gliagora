import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { issueMonth, nextIssueDate } from '@/lib/newsletter/issue/schedule'
import { LAUNCH_ISSUE } from './data/launch-issue'

// Saves the launch issue of Glia Notes (D41) as a draft, while no issue exists, so the editor finds
// it ready on launch day (M11, D53): she sets its date, has the selected positions proposed, edits
// the opening note, previews it, sends a test and schedules it. Its date starts as the next first
// Tuesday after this migration runs; nothing is sent from a draft. Plain SQL against the table of
// 20261017_130000_newsletter_issues keeps this working after the collection changes.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const sendAt = nextIssueDate(new Date())
  await db.execute(sql`
    insert into newsletter_issues (send_at, month, subject, preheader, intro, status)
    select ${sendAt.toISOString()}, ${issueMonth(sendAt)}, ${LAUNCH_ISSUE.subject},
      ${LAUNCH_ISSUE.preheader}, ${LAUNCH_ISSUE.intro}, 'draft'
    where not exists (select 1 from newsletter_issues)`)
}

// Removes it only while it is the untouched draft this migration saved.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    delete from newsletter_issues
    where status = 'draft' and listmonk_campaign_id is null and snapshot is null
      and subject = ${LAUNCH_ISSUE.subject} and intro = ${LAUNCH_ISSUE.intro}`)
}
