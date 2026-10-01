import { type Locale, locales } from '@/i18n/routing'
import { normaliseEmail } from '@/lib/members/email-address'
import { MEMBER_PATHS } from '@/lib/members/paths'

import {
  type FormDependencies,
  type FormOutcome,
  type FormState,
  type Parse,
  type PublicForm,
  formText,
  handlePublicForm,
} from './public-form'
import { VERIFY_EMAIL_LIMIT, emailLimits, hashLimitAddress, memberVerifyLimit } from './rate-limit'
import { emailProblem } from './text'

// Adding an email address to the signed-in member's account, or changing it (M4b, D49; the M4b
// design §7.4): the checks of every public form (src/lib/forms/public-form.ts) with one field, the
// address, and a link to it that the member opens to prove it. Only for a member who is signed in
// (`gate`). Besides its own limit per IP address it has one per member, and shares the budget of
// the address the link goes to, and the site-wide cap, with every form that sends an email
// (`emailLimits`). The email is the same whether or not the address belongs to another account:
// that is decided only when the link is used. The Server Action
// (src/app/(frontend)/en/account/actions.ts) passes in what this needs and sends the email.

/** Where the form leads once a link is sent, or seems to be (the hidden field). */
export const VERIFY_EMAIL_SENT_PATH = MEMBER_PATHS.emailSent

/** Each message in messages/{locale}.json under `account.email.errors`. */
export type VerifyEmailErrorCode = 'emailMissing' | 'emailInvalid' | 'emailTooLong' | 'emailSame'

/** What the member sent, as typed: shown again in the form after an error. */
export type VerifyEmailValues = { email: string }

export type VerifyEmailData = {
  /** The address in its stored form (normaliseEmail): where the email goes, and what it proves. */
  email: string
  locale: Locale
}

export type VerifyEmailErrors = Partial<Record<'email', VerifyEmailErrorCode>>

/** The member who sends the form, as it needs them; null when the request has no session. */
export type VerifyEmailMember = { id: number; email: string | null } | null

export function readVerifyEmailValues(form: FormData): VerifyEmailValues {
  return { email: formText(form, 'email') }
}

/** Checks the form: the address to send the link to, or the problem with it. */
export function parseVerifyEmail(
  values: VerifyEmailValues,
  locale: string,
  current: string | null = null,
): Parse<VerifyEmailData, VerifyEmailErrors> {
  const address = values.email.trim()
  if (address === '') return { ok: false, errors: { email: 'emailMissing' } }
  const problem = emailProblem(address)
  if (problem) return { ok: false, errors: { email: problem } }
  const email = normaliseEmail(address)
  if (!email) return { ok: false, errors: { email: 'emailInvalid' } }
  // The account's own address needs no link: nothing would change.
  if (email === current) return { ok: false, errors: { email: 'emailSame' } }
  return {
    ok: true,
    data: {
      email,
      // The form's own hidden field; anything else is read as English, the site's language.
      locale: (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en',
    },
  }
}

/** The form for this member: their own limit, and their address, which needs no link. */
export function verifyEmailForm(
  member: VerifyEmailMember,
): PublicForm<VerifyEmailValues, VerifyEmailData, VerifyEmailErrors> {
  return {
    name: 'Address link',
    limit: VERIFY_EMAIL_LIMIT,
    gate: () => (member ? null : 'signedOut'),
    moreLimits: (data, secret) => [
      ...(member ? [memberVerifyLimit(member.id)] : []),
      ...emailLimits(hashLimitAddress(data.email, secret)),
    ],
    read: readVerifyEmailValues,
    parse: (values, locale) => parseVerifyEmail(values, locale, member?.email ?? null),
  }
}

export type VerifyEmailOutcome = FormOutcome<VerifyEmailValues, VerifyEmailErrors>

/** Checks a request for a link to add an address and, if it is taken, has `deps.save` send it. */
export function handleVerifyEmailRequest(
  form: FormData,
  deps: FormDependencies<VerifyEmailData> & { member: VerifyEmailMember },
): Promise<VerifyEmailOutcome> {
  return handlePublicForm(form, deps, verifyEmailForm(deps.member))
}

export type VerifyEmailState = FormState<VerifyEmailValues>

export const emptyVerifyEmailValues = (): VerifyEmailValues => ({ email: '' })
