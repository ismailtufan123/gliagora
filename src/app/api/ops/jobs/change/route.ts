import config from '@payload-config'
import { getPayload } from 'payload'
import { ZodError } from 'zod'

import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { applyChanges } from '@/lib/routine/change'

// "Update the jobs" (D59): the operator's corrections of published jobs ("remove this job", "change
// its deadline"), each through the collection's rules and the routine's (`?dry=1` checks only).
// Only from inside the app's container:
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/jobs/change/ < changes.json

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  const payload = await getPayload({ config })
  try {
    const result = await applyChanges(payload, await request.json(), { dryRun })
    payload.logger.info(
      `ops jobs/change${dryRun ? ' (dry run)' : ''}: ${result.results.length} changes`,
    )
    return opsJson(result)
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return opsJson({ error: 'Send {"format": "gliagora-job-changes/1", "changes": [...]}.' }, 400)
    }
    payload.logger.error(`ops jobs/change failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
