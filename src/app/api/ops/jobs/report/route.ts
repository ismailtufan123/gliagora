import config from '@payload-config'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { routineReport } from '@/lib/routine/report'

// "Update the jobs" (D59): the short report at the end of a run: the open jobs against the launch
// gate, the waiting candidates by source, the questions for the operator with their admin pages,
// the manual sources due and the link check's findings. Read only. Only from inside the container:
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs GET /api/ops/jobs/report/

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const payload = await getPayload({ config })
  try {
    return opsJson(await routineReport(payload, new Date()))
  } catch (error) {
    payload.logger.error(`ops jobs/report failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
