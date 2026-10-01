'use server'

import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { redirect, unstable_rethrow } from 'next/navigation'
import { getPayload } from 'payload'

import { deliverWhileWaiting } from '@/lib/email/deliver'
import { verifyEmailEmail } from '@/lib/email/messages'
import { errorSummary } from '@/lib/errors'
import { altchaKey } from '@/lib/forms/altcha'
import { newReference, stateAfter } from '@/lib/forms/public-form'
import { postgresLimitStore } from '@/lib/forms/rate-limit'
import {
  VERIFY_EMAIL_SENT_PATH,
  type VerifyEmailMember,
  type VerifyEmailState,
  handleVerifyEmailRequest,
  readVerifyEmailValues,
} from '@/lib/forms/verify-email'
import { memberAuthConfig } from '@/lib/members/config'
import { appOrigin } from '@/lib/members/origin'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { currentMember } from '@/lib/members/session'
import { createEmailToken, deleteEmailToken, memberDb } from '@/lib/members/store'

// The Server Action behind "Email me a confirmation link" on the account page (M4b, D49; the M4b
// design §7.4): adding an email address to the signed-in member's account, or changing it. The
// checks are those of every public form (src/lib/forms/verify-email.ts); once they pass, this
// stores the link (only its SHA-256), bound to the member who asked, and emails it while the
// member waits. The link works for 24 hours, only for that member, signed in (the page it opens,
// /en/sign-in/link/). If the mail server does not take the email within 20 seconds, the link is
// deleted again and the form says it could not send the email. A request without a session (signed
// out meanwhile, in another browser) leads to "You are signed out".

export async function sendVerifyLink(
  previous: VerifyEmailState,
  form: FormData,
): Promise<VerifyEmailState> {
  const now = new Date()
  const requestHeaders = await headers()
  const origin = appOrigin(requestHeaders)
  const secret = process.env.PAYLOAD_SECRET ?? ''
  // Off without a mail server, the spam check or a known origin: the form then says it is
  // temporarily unavailable, as the page itself does.
  const key = origin && memberAuthConfig().email.on ? altchaKey() : null
  const t = await getTranslations({ locale: 'en', namespace: 'account.email.errors' })
  const message = (code: string, values?: { reference: string }) =>
    t(code as never, values as never)

  let member: VerifyEmailMember
  try {
    const current = await currentMember()
    member = current && { id: current.member.id, email: current.member.email }
  } catch (error) {
    unstable_rethrow(error)
    const reference = newReference()
    console.error(`Address link not sent (reference ${reference}): ${errorSummary(error)}`)
    return stateAfter(
      { kind: 'failed', status: 500, reference, values: readVerifyEmailValues(form) },
      previous,
      message,
      key,
    )
  }

  const outcome = await handleVerifyEmailRequest(form, {
    altchaKey: key,
    secret,
    headers: requestHeaders,
    now,
    member,
    limits: async () => postgresLimitStore(await getPayload({ config })),
    save: async (data) => {
      const payload = await getPayload({ config })
      const db = memberDb(payload)
      const { token } = await createEmailToken(
        db,
        { purpose: 'verify-email', email: data.email, memberId: member!.id, locale: data.locale },
        now,
      )
      const link = `${origin}${MEMBER_PATHS.signInLink}?token=${token}`
      // To the address in the form the link proves, never as typed (as the sign-in link).
      const delivery = await deliverWhileWaiting(
        payload,
        data.email,
        verifyEmailEmail({ locale: data.locale, link }),
        'Address link',
      )
      if (delivery !== 'sent') {
        await deleteEmailToken(db, token)
        return 'unavailable'
      }
    },
  })
  // Also when the hidden field was filled in: the same answer as for a real request.
  if (outcome.kind === 'sent') {
    // As for the other forms: Back from the sent page then shows the form with a new challenge.
    refresh()
    redirect(VERIFY_EMAIL_SENT_PATH)
  }
  // Signed out meanwhile: the page that says so, with the way to sign in again.
  if (outcome.kind === 'refused' && outcome.problem === 'signedOut')
    redirect(MEMBER_PATHS.signedOut)

  return stateAfter(outcome, previous, message, key)
}
