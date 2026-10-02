import config from '@payload-config'
import { getPayload } from 'payload'

import { appOrigin } from '@/lib/members/origin'
import { seeOther } from '@/lib/members/responses'
import { confirmSignup, handleConfirmation, sendWelcome } from '@/lib/newsletter/confirm'
import { listmonkFromEnv } from '@/lib/newsletter/listmonk'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'

// Confirming a Glia Notes signup (M2, D50; PLAN §13): the button on the page the emailed link
// opens posts here. The rules are in src/lib/newsletter/confirm.ts; this gives them the database,
// listmonk and the welcome email (sent after the commit, best effort, with the subscriber's
// unsubscribe links on the site's own origin).
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const now = new Date()
  const listmonk = listmonkFromEnv()
  // `handleConfirmation` checks the origin first; without one it never reaches the welcome.
  const origin = appOrigin(request.headers) ?? ''
  return handleConfirmation(request, {
    confirm: listmonk
      ? async (token) => confirmSignup(await getPayload({ config }), listmonk, token, now)
      : null,
    welcome: async (confirmed) => sendWelcome(await getPayload({ config }), origin)(confirmed),
  })
}

/** Confirming changes something, so it is a POST: an address opened in the browser shows the page. */
export function GET() {
  return seeOther(NEWSLETTER_PATHS.confirm)
}
