import config from '@payload-config'
import { getPayload } from 'payload'

import { seeOther } from '@/lib/members/responses'
import { listmonkFromEnv } from '@/lib/newsletter/listmonk'
import {
  handleUnsubscribe,
  recordUnsubscribe,
  unsubscribePagePath,
} from '@/lib/newsletter/unsubscribe'

// Unsubscribing from Glia Notes (M2, D50; PLAN §13): the unsubscribe page's button posts here, and
// so do mail programs (`List-Unsubscribe`, RFC 8058's one-click). Deliberately without the origin
// check of the other POST routes: see src/lib/newsletter/unsubscribe.ts, which holds the rules;
// this gives them listmonk and the database.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const now = new Date()
  return handleUnsubscribe(request, {
    listmonk: listmonkFromEnv(),
    record: async (subscriber, source) =>
      recordUnsubscribe(await getPayload({ config }), subscriber, source, now),
  })
}

/**
 * Unsubscribing changes something, so it is a POST: an address opened in the browser (or by a
 * mail scanner) shows the page, which asks first, with the same subscriber.
 */
export function GET(request: Request) {
  return seeOther(unsubscribePagePath(request))
}
