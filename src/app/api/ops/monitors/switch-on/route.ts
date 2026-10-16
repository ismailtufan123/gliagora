import config from '@payload-config'
import { getPayload } from 'payload'
import { z } from 'zod'

import { errorSummary } from '@/lib/errors'
import { opsAllowed, opsJson, opsRefused } from '@/lib/ops/auth'
import { AUTOMATIC_KINDS } from '@/lib/sources/kinds'

// Switches the monitor on for the sources named, or for every automatic source (M7, D52): the
// seeded sources start with "Monitor on" unticked, so that the first run is the one by hand, and
// the schedule takes over once it has been checked. Only from inside the app's container
// (src/lib/ops/auth.ts):
//   echo '{"sources":"all"}' | docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/monitors/switch-on/
// Editors can do the same in the admin (tick "Monitor on").

export const dynamic = 'force-dynamic'

const body = z.strictObject({
  sources: z.union([z.literal('all'), z.array(z.number().int().positive()).min(1).max(500)]),
})

export async function POST(request: Request) {
  if (!opsAllowed(request)) return opsRefused()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return opsJson({ error: 'Send {"sources": "all"} or {"sources": [IDs]}.' }, 400)
  const payload = await getPayload({ config })
  try {
    const { docs } = await payload.update({
      collection: 'sources',
      where: {
        and: [
          { kind: { in: AUTOMATIC_KINDS } },
          { active: { equals: false } },
          ...(parsed.data.sources === 'all' ? [] : [{ id: { in: parsed.data.sources } }]),
        ],
      },
      data: { active: true },
      depth: 0,
    })
    return opsJson({ switchedOn: docs.map((doc) => doc.id) })
  } catch (error) {
    payload.logger.error(`ops monitors/switch-on failed: ${errorSummary(error)}`)
    return opsJson({ error: errorSummary(error) }, 500)
  }
}
