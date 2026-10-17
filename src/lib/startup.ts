import config from '@payload-config'
import { getPayload } from 'payload'

import { releaseInterruptedJobs } from '@/jobs/release'
import { altchaKey } from '@/lib/forms/altcha'
import { describeEmailCap, emailCap } from '@/lib/forms/email-cap'
import { describeMemberAuth, memberAuthConfig } from '@/lib/members/config'
import { describeNewsletter, newsletterConfig } from '@/lib/newsletter/config'
import { describeIssuePush } from '@/lib/newsletter/issue/settings'
import { describeSiteStage, siteStageSetting } from '@/lib/site-stage'
import { describeClaudeApi } from '@/lib/ai/claude-api'

/**
 * Connects Payload when the production server starts, which applies pending database migrations
 * (`prodMigrations` in payload.config.ts; the deploy script takes a backup first, PLAN §11.5).
 *
 * It also starts the scheduled jobs (`cron: true`; they run only where PAYLOAD_JOBS_AUTORUN is
 * "true", see payload.config.ts), after releasing jobs that a restart cut off: the nightly ROR
 * import and the maintenance tasks (src/jobs/maintenance/).
 *
 * If the database is unreachable or a migration fails, the process exits. Docker then restarts the
 * container, so the app recovers by itself once PostgreSQL is available (for example after a server
 * reboot) instead of answering every request with an error.
 *
 * A missing ALTCHA_HMAC_KEY only disables the "Suggest a listing" form (it says it is temporarily
 * unavailable), so the site starts anyway, with a warning in the log.
 *
 * One line says which ways of member sign-in are on (M4b, D49), by name only, and one line each
 * names a setting that switched a way off; never a value. One line gives the cap on the emails the
 * forms send (EMAIL_CAP_HOUR, EMAIL_CAP_DAY), and one line each names a setting it could not use.
 * One line names the site's stage (`Site stage: private`, D50), with one more when SITE_STAGE has a
 * value that is not a stage.
 * One line says whether the Glia Notes signup and unsubscribing are on (M2, D50: listmonk's
 * settings, a mail server and the spam check), and why not, and one line each names a setting it
 * could not use.
 * One line says whether issues of Glia Notes can be pushed to listmonk (M11, D53: GLIA_NOTES_PUSH,
 * the issues' listmonk user, the mailbox's limits), and at which rate.
 * One line says whether AI drafts through the Claude API are on (M7, D52), with the model and the
 * monthly cap, never the key.
 */
export async function connectOnStart(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return
  if (!altchaKey()) {
    console.warn(
      'ALTCHA_HMAC_KEY is missing or too short: the "Suggest a listing" form is unavailable.',
    )
  }
  const memberAuth = memberAuthConfig()
  console.log(describeMemberAuth(memberAuth))
  for (const problem of memberAuth.problems) console.error(problem)
  const cap = emailCap()
  console.log(describeEmailCap(cap))
  for (const problem of cap.problems) console.error(problem)
  const stage = siteStageSetting()
  console.log(describeSiteStage(stage))
  if (stage.problem) console.error(stage.problem)
  const newsletter = newsletterConfig()
  console.log(describeNewsletter(newsletter))
  for (const problem of newsletter.problems) console.error(problem)
  console.log(describeIssuePush())
  console.log(describeClaudeApi())
  try {
    const payload = await getPayload({ config })
    await releaseInterruptedJobs(payload)
    await getPayload({ config, cron: true })
  } catch (error) {
    console.error(
      'Startup failed: cannot connect to the database or apply migrations.',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  }
}
