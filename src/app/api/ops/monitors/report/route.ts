import config from '@payload-config'
import { getPayload } from 'payload'
import { z } from 'zod'

import { errorSummary } from '@/lib/errors'
import { REPORT_PARTS, monitorReport } from '@/lib/monitors/report'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'

// The report on the monitors (M7, second round): per source its runs, failures, postings and
// candidates; per candidate its redacted title, status, the editor's reason and what the monitor
// found; per skipped posting its redacted title and outcome (src/lib/monitors/report.ts). Read
// only, never a candidate's text or anything about members. Only from inside the app's container
// (src/lib/ops/auth.ts):
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs GET /api/ops/monitors/report/
// `?part=sources` (or candidates, skipped) gives one part, `?source=12` one source.

export const dynamic = 'force-dynamic'

const query = z.strictObject({
  part: z.enum(REPORT_PARTS).optional(),
  source: z.coerce.number().int().positive().optional(),
})

export async function GET(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success)
    return opsJson(
      { error: 'Use ?part=sources|candidates|skipped and ?source=ID, or neither.' },
      400,
    )
  const payload = await getPayload({ config })
  try {
    const report = await monitorReport(payload, new Date(), {
      source: parsed.data.source,
      parts: parsed.data.part ? [parsed.data.part] : undefined,
    })
    payload.logger.info(
      `ops monitors/report: ${report.sources?.length ?? 0} sources, ${report.candidates?.length ?? 0} candidates, ${report.skipped?.length ?? 0} skipped`,
    )
    return opsJson(report)
  } catch (error) {
    payload.logger.error(`ops monitors/report failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
