import config from '@payload-config'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { redactWaitingAgain } from '@/lib/redaction/stored'

// Redaction's second round over what is stored (M7, third round; the operator's go-ahead of
// 2026-10-22): the waiting candidates' text, title, facts and draft quotes, and their saved
// versions, redacted again with the current rules (src/lib/redaction/stored.ts). `?dry=1` counts
// without saving. Only from inside the app's container (src/lib/ops/auth.ts):
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST '/api/ops/candidates/redact/?dry=1' < /dev/null
// The answer holds counts only.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  const payload = await getPayload({ config })
  try {
    const result = await redactWaitingAgain(payload, { dryRun })
    payload.logger.info(
      `ops candidates/redact${dryRun ? ' (dry run)' : ''}: ${result.changed} of ${result.candidates} changed, ${result.versionsChanged} versions, ${result.failed} failed`,
    )
    return opsJson(result)
  } catch (error) {
    payload.logger.error(`ops candidates/redact failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
