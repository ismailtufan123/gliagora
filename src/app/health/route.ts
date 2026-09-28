import config from '@payload-config'
import { getPayload } from 'payload'

import { errorSummary } from '@/lib/errors'

// Health check for Docker and Caddy: 200 when the app can reach its migrated database.
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const payload = await getPayload({ config })
    await payload.count({ collection: 'users' })
    return Response.json({ status: 'ok' }, { headers: noStore })
  } catch (error) {
    console.error('Health check failed:', errorSummary(error))
    return Response.json({ status: 'error' }, { status: 503, headers: noStore })
  }
}
