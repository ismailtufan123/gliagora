import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { postgresLimitStore } from '@/lib/forms/rate-limit'
import { NEWSLETTER_COOKIE } from '@/lib/members/cookies'
import { appOrigin } from '@/lib/members/origin'
import { seeOther } from '@/lib/members/responses'
import { newsletterConfig } from '@/lib/newsletter/config'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { handleResend } from '@/lib/newsletter/resend'
import { recordAndSendSignup } from '@/lib/newsletter/signup'

// "Send it again" on "Check your inbox" (M2, D50; PLAN §9.10). The rules are in
// src/lib/newsletter/resend.ts; this gives them the cookie, the database and the mail server.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const now = new Date()
  const origin = appOrigin(request.headers)
  return handleResend(request, {
    now,
    secret: process.env.PAYLOAD_SECRET ?? '',
    cookie: (await cookies()).get(NEWSLETTER_COOKIE)?.value,
    on: origin !== null && newsletterConfig().signup.on,
    limits: async () => postgresLimitStore(await getPayload({ config })),
    send: async (inbox) =>
      origin
        ? recordAndSendSignup(await getPayload({ config }), inbox, { origin, now })
        : 'unavailable',
  })
}

/** Sending changes something, so it is a POST: an address opened in the browser shows the page. */
export function GET() {
  return seeOther(NEWSLETTER_PATHS.checkInbox)
}
