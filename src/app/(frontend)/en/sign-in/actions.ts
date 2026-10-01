'use server'

import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { deliverWhileWaiting } from '@/lib/email/deliver'
import { signInEmail } from '@/lib/email/messages'
import { altchaKey } from '@/lib/forms/altcha'
import { stateAfter } from '@/lib/forms/public-form'
import { postgresLimitStore } from '@/lib/forms/rate-limit'
import { SIGN_IN_SENT_PATH, type SignInState, handleSignInRequest } from '@/lib/forms/sign-in'
import { memberAuthConfig } from '@/lib/members/config'
import { SIGN_IN_COOKIE, signInCookie } from '@/lib/members/cookies'
import { appOrigin } from '@/lib/members/origin'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { safeNext } from '@/lib/members/return-path'
import { openSignIn, sealSignIn } from '@/lib/members/seal'
import { createEmailToken, deleteEmailToken, memberDb } from '@/lib/members/store'
import { hashToken, newBinding } from '@/lib/members/tokens'

// The Server Action behind "Email me a sign-in link" (M4b, D49; the M4b design §7.1). The checks
// are those of every public form (src/lib/forms/sign-in.ts); once they pass, this stores the link
// (only its SHA-256), emails it while the person waits, and binds it to this browser: the sealed
// sign-in cookie holds a random value whose hash the link keeps, so the page the link opens can
// warn when it is opened in another browser. If the mail server does not take the email within
// 20 seconds, the link is deleted again and the form says it could not send the email. Every
// address gets the same answer, whether it has an account or not.

export async function sendSignInLink(previous: SignInState, form: FormData): Promise<SignInState> {
  const now = new Date()
  const requestHeaders = await headers()
  const origin = appOrigin(requestHeaders)
  const secret = process.env.PAYLOAD_SECRET ?? ''
  // Off without a mail server, the spam check or a known origin: the form then says it is
  // temporarily unavailable, as the page itself does.
  const key = origin && memberAuthConfig().email.on ? altchaKey() : null
  const outcome = await handleSignInRequest(form, {
    altchaKey: key,
    secret,
    headers: requestHeaders,
    now,
    limits: async () => postgresLimitStore(await getPayload({ config })),
    save: async (data) => {
      const payload = await getPayload({ config })
      const db = memberDb(payload)
      const jar = await cookies()
      // A browser that asked for a link a moment ago keeps its binding, so both links match it.
      const held = openSignIn(jar.get(SIGN_IN_COOKIE)?.value, secret, now, 'email')
      const binding = held?.bind ?? newBinding()
      const { token } = await createEmailToken(
        db,
        {
          purpose: 'sign-in',
          email: data.email,
          browserHash: hashToken(binding),
          next: data.next ? safeNext(data.next, origin!) : null,
          locale: data.locale,
        },
        now,
      )
      const link = `${origin}${MEMBER_PATHS.signInLink}?token=${token}`
      // To the address in the form the link proves and signs in to, never as typed: on a mail
      // system whose mailbox names differ by case, both must be the same mailbox.
      const delivery = await deliverWhileWaiting(
        payload,
        data.email,
        signInEmail({ locale: data.locale, link }),
        'Sign-in link',
      )
      if (delivery !== 'sent') {
        await deleteEmailToken(db, token)
        return 'unavailable'
      }
      jar.set(signInCookie(sealSignIn({ kind: 'email', bind: binding }, secret, now)))
    },
  })
  // Also when the hidden field was filled in: the same answer as for a real request.
  if (outcome.kind === 'sent') {
    // As for the other forms: Back from the sent page then shows the form with a new challenge.
    refresh()
    redirect(SIGN_IN_SENT_PATH)
  }

  const t = await getTranslations({ locale: 'en', namespace: 'signIn.errors' })
  return stateAfter(outcome, previous, (code, values) => t(code as never, values as never), key)
}
