import config from '@payload-config'
import { getPayload } from 'payload'
import { ZodError } from 'zod'

import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { searchInstitutions } from '@/lib/routine/report'

// "Update the jobs" (D59): our institutions (ROR) by name, for a decision that names the
// institution where the work happens. Read only. Only from inside the app's container:
//   echo '{"names":["Max Planck Institute for Brain Research"]}' | docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/jobs/institutions/

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const payload = await getPayload({ config })
  try {
    return opsJson(await searchInstitutions(payload, await request.json()))
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return opsJson({ error: 'Send {"names": ["…"]}, 1 to 20 names.' }, 400)
    }
    payload.logger.error(`ops jobs/institutions failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
