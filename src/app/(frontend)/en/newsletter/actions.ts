'use server'

import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { altchaKey } from '@/lib/forms/altcha'
import {
  NEWSLETTER_SENT_PATH,
  type NewsletterState,
  handleNewsletterSignup,
} from '@/lib/forms/newsletter'
import type { NewsletterData } from '@/lib/forms/newsletter-schema'
import { stateAfter } from '@/lib/forms/public-form'
import { postgresLimitStore } from '@/lib/forms/rate-limit'
import { newsletterCookie } from '@/lib/members/cookies'
import { appOrigin } from '@/lib/members/origin'
import { newsletterConfig } from '@/lib/newsletter/config'
import { type InboxState, newInbox, sealInbox } from '@/lib/newsletter/cookie'
import { recordAndSendSignup } from '@/lib/newsletter/signup'

// The Server Action behind the Glia Notes signup (M2, D50; PLAN §9.10, §13). The checks are those
// of every public form (src/lib/forms/newsletter.ts); once they pass, this stores the confirmation
// link (with the address, the locale and the consent text's version; nothing in listmonk yet) and
// emails it while the person waits (src/lib/newsletter/signup.ts). If the mail server does not take
// it within 20 seconds, the link is deleted again and the form says it could not send the email.
// Then the sealed cookie for "Check your inbox" (the address, masked there, and the time of the
// email), and the redirect there. Every address gets the same answer, subscribed or not, and so
// does a filled-in hidden field, but without the cookie: "Send it again" has no spam check of its
// own, so it may only send to an address whose first email passed this form's (the page then shows
// its general text).

export async function sendNewsletterSignup(
  previous: NewsletterState,
  form: FormData,
): Promise<NewsletterState> {
  const now = new Date()
  const requestHeaders = await headers()
  const origin = appOrigin(requestHeaders)
  const secret = process.env.PAYLOAD_SECRET ?? ''
  // Off without listmonk, a mail server, the spam check or a known origin: the form then says it
  // is temporarily unavailable, as the page itself does.
  const key = origin && newsletterConfig().signup.on ? altchaKey() : null
  let sent: InboxState | null = null
  const outcome = await handleNewsletterSignup(form, {
    altchaKey: key,
    secret,
    headers: requestHeaders,
    now,
    limits: async () => postgresLimitStore(await getPayload({ config })),
    // Without an origin the form is off (no key above), so `save` is never reached then.
    save: async (data: NewsletterData) => {
      if (!origin) return 'unavailable'
      // The consent given now (the consent text's version this form showed), kept in the link and
      // in the cookie, so a link sent again records the same.
      const inbox = newInbox({ email: data.email, locale: data.locale }, now)
      const result = await recordAndSendSignup(await getPayload({ config }), inbox, {
        origin,
        now,
      })
      if (result !== 'unavailable') sent = inbox
      return result
    },
  })
  if (outcome.kind === 'sent') {
    if (sent) {
      const jar = await cookies()
      jar.set(newsletterCookie(sealInbox(sent, secret)))
    }
    // As for the other forms: Back from the next page then shows the form with a new challenge.
    refresh()
    redirect(NEWSLETTER_SENT_PATH)
  }

  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.errors' })
  return stateAfter(outcome, previous, (code, values) => t(code as never, values as never), key)
}
