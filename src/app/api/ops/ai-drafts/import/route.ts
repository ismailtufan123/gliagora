import config from '@payload-config'
import { getPayload } from 'payload'
import { ZodError } from 'zod'

import { importDrafts } from '@/lib/ai/weekly'
import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'

// The weekly AI drafts' import (M7, D52; docs/weekly-drafts.md): each draft is checked (its shape,
// its terms, the hash of the input it was written from) and stored in its candidate's
// `aiSuggestion`; `?dry=1` checks without storing. Only from inside the app's container:
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/ai-drafts/import/ < drafts.json
// The answer holds candidate IDs, outcomes and the names of fields that failed, never text.

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  const payload = await getPayload({ config })
  try {
    const result = await importDrafts(payload, await request.json(), { dryRun })
    const done = Object.entries(result.counts)
      .filter(([, n]) => n > 0)
      .map(([name, n]) => `${n} ${name}`)
      .join(', ')
    payload.logger.info(`ops ai-drafts/import${dryRun ? ' (dry run)' : ''}: ${done || 'nothing'}`)
    return opsJson(result)
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return opsJson(
        { error: 'Send {"format": "gliagora-ai-drafts/1", "drafts": [{"id": …, "draft": {…}}]}.' },
        400,
      )
    }
    payload.logger.error(`ops ai-drafts/import failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
