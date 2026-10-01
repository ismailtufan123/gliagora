import config from '@payload-config'
import { getPayload } from 'payload'

import { confirmDataRequest, handleConfirmation } from '@/lib/data-requests/confirm'
import { DATA_REQUEST_PATHS } from '@/lib/data-requests/paths'
import { seeOther } from '@/lib/members/responses'

// Confirming a request from the data-request form (M4b, D49; the M4b design §7.8 step 4): the
// button on the page the emailed link opens posts here. The rules are in
// src/lib/data-requests/confirm.ts; this gives them the database.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const now = new Date()
  return handleConfirmation(request, {
    confirm: async (token) => confirmDataRequest(await getPayload({ config }), token, now),
  })
}

/** Confirming changes something, so it is a POST: an address opened in the browser shows the page. */
export function GET() {
  return seeOther(DATA_REQUEST_PATHS.confirm)
}
