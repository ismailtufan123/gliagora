import config from '@payload-config'
import { getPayload } from 'payload'

import { exportForDrafts } from '@/lib/ai/weekly'
import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'

// The weekly AI drafts' export (M7, D52; docs/weekly-drafts.md): the candidates that wait for a
// draft, with their redacted title and source text only (src/lib/ai/input.ts). Only from inside the
// app's container, with the operator's standing go-ahead:
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs GET /api/ops/ai-drafts/export/

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const payload = await getPayload({ config })
  try {
    const exported = await exportForDrafts(payload, new Date())
    payload.logger.info(`ops ai-drafts/export: ${exported.candidates.length} candidates`)
    return opsJson(exported)
  } catch (error) {
    payload.logger.error(`ops ai-drafts/export failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
