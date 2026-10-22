import config from '@payload-config'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { closeGoneJobs } from '@/lib/routine/close'

// "Update the jobs" (D59): the published jobs whose page the weekly link check found gone or filled
// withdrawn (`?dry=1` lists them only). Only from inside the app's container:
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/jobs/close/ < /dev/null

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  const payload = await getPayload({ config })
  try {
    const result = await closeGoneJobs(payload, new Date(), { dryRun })
    payload.logger.info(
      `ops jobs/close${dryRun ? ' (dry run)' : ''}: ${result.closed.length} closed, ${result.refused.length} refused`,
    )
    return opsJson(result)
  } catch (error) {
    payload.logger.error(`ops jobs/close failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
