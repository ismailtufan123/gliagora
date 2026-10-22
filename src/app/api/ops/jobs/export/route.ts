import config from '@payload-config'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { exportForDecisions } from '@/lib/routine/export'

// "Update the jobs" (D59, docs/update-jobs.md): the drafted waiting candidates, each with its
// redacted input, its draft and the server's checks, for Claude Code to decide. Only from inside
// the app's container, with the operator's standing go-ahead (src/lib/ops/auth.ts):
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs GET /api/ops/jobs/export/

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const payload = await getPayload({ config })
  try {
    const exported = await exportForDecisions(payload, new Date())
    payload.logger.info(`ops jobs/export: ${exported.candidates.length} candidates`)
    return opsJson(exported)
  } catch (error) {
    payload.logger.error(`ops jobs/export failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
