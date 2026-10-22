import config from '@payload-config'
import { getPayload } from 'payload'
import { ZodError } from 'zod'

import { SKIPPED, withTaskLock } from '@/jobs/maintenance/task'
import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { applyDecisions } from '@/lib/routine/decide'

// "Update the jobs" (D59, docs/update-jobs.md): the decisions applied, each publication after the
// written rules and the last look at the posting's page; `?dry=1` checks the decisions and the
// rules without reading a page or saving. Only from inside the app's container:
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/jobs/decide/ < decisions.json
// The answer holds candidate IDs, outcomes, the rules' words and the jobs' short IDs. A run takes the
// locks of the monitors and of the link check, so that no two of them read a site at once.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  const payload = await getPayload({ config })
  try {
    const body = await request.json()
    const result = dryRun
      ? await applyDecisions(payload, body, { dryRun })
      : await withTaskLock(payload, 'monitorSources', async () => {
          const inner = await withTaskLock(payload, 'checkLinks', () =>
            applyDecisions(payload, body),
          )
          return inner === SKIPPED ? null : inner
        })
    if (result === SKIPPED || result === null) {
      return opsJson({ error: 'The monitors or the link check are reading now; try later.' }, 409)
    }
    const done = Object.entries(result.counts)
      .filter(([, n]) => n > 0)
      .map(([name, n]) => `${n} ${name}`)
      .join(', ')
    payload.logger.info(`ops jobs/decide${dryRun ? ' (dry run)' : ''}: ${done || 'nothing'}`)
    return opsJson(result)
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      const where =
        error instanceof ZodError
          ? error.issues.map((issue) => issue.path.join('.')).join(', ')
          : ''
      return opsJson(
        {
          error: `Send {"format": "gliagora-job-decisions/1", "decisions": [...]}.${where ? ` Check: ${where}.` : ''}`,
        },
        400,
      )
    }
    payload.logger.error(`ops jobs/decide failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
