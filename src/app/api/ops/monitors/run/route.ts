import config from '@payload-config'
import { getPayload } from 'payload'
import { z } from 'zod'

import { monitorSources } from '@/jobs/maintenance/monitorSources'
import { SKIPPED, withTaskLock } from '@/jobs/maintenance/task'
import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'

// Runs the monitors of the sources named, now (M7, D52): the first run by hand on a few sources,
// approved by the operator. Only from inside the app's container (src/lib/ops/auth.ts):
//   echo '{"sources":[3,7]}' | docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/monitors/run/
// It takes the task lock of the scheduled run, so the two never read at the same time, and answers
// with counts per source (no titles, no addresses).

export const dynamic = 'force-dynamic'

const body = z.strictObject({ sources: z.array(z.number().int().positive()).min(1).max(20) })

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return opsJson({ error: 'Send {"sources": [IDs]}, 1 to 20 of them.' }, 400)
  const payload = await getPayload({ config })
  try {
    const done = await withTaskLock(payload, 'monitorSources', () =>
      monitorSources(payload, new Date(), { only: parsed.data.sources }),
    )
    if (done === SKIPPED)
      return opsJson({ error: 'The scheduled run is under way; try later.' }, 409)
    return opsJson(done)
  } catch (error) {
    payload.logger.error(`ops monitors/run failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
