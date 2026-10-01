import { type Locale, locales } from '@/i18n/routing'
import { normaliseEmail } from '@/lib/members/email-address'
import { MEMBER_PATHS } from '@/lib/members/paths'

import { FORM_INPUTS } from './fields'
import {
  type FormDependencies,
  type FormOutcome,
  type FormState,
  type Parse,
  type PublicForm,
  formText,
  handlePublicForm,
} from './public-form'
import { SIGN_IN_LIMIT, emailLimits, hashLimitAddress } from './rate-limit'
import { emailProblem } from './text'

// Asking for a sign-in link (M4b, D49; the M4b design §7.1): the checks of every public form
// (src/lib/forms/public-form.ts) with one field, the email address. Besides its own limit per IP
// address it shares the budget of the address the link goes to, and the site-wide cap, with every
// form that sends an email (`emailLimits`). The answer is the same for every address, whether it
// has an account or not. The Server Action (src/app/(frontend)/en/sign-in/actions.ts) passes in
// what this needs and sends the email.

/** Where the form leads once a link is sent, or seems to be (the hidden field). */
export const SIGN_IN_SENT_PATH = MEMBER_PATHS.signInSent

/** Each message in messages/{locale}.json under `signIn.errors`. */
export type SignInErrorCode = 'emailMissing' | 'emailInvalid' | 'emailTooLong'

/** What the person sent, as typed: shown again in the form after an error. */
export type SignInValues = {
  email: string
  /** Where to go after signing in, from the page's address (checked when the link is made). */
  next: string
}

export type SignInData = {
  /** The address in its stored form (normaliseEmail): what the link proves. */
  email: string
  /** The address as typed (trimmed): where the email goes. */
  address: string
  next: string | null
  locale: Locale
}

export type SignInErrors = Partial<Record<'email', SignInErrorCode>>

/** The longest `next` read from the form; the link keeps at most NEXT_MAX (return-path.ts). */
const NEXT_READ_MAX = 2000

export function readSignInValues(form: FormData): SignInValues {
  return {
    email: formText(form, 'email'),
    next: formText(form, FORM_INPUTS.next).slice(0, NEXT_READ_MAX),
  }
}

/** Checks the form: the address to send the link to, or the problem with it. */
export function parseSignIn(values: SignInValues, locale: string): Parse<SignInData, SignInErrors> {
  const address = values.email.trim()
  if (address === '') return { ok: false, errors: { email: 'emailMissing' } }
  const problem = emailProblem(address)
  if (problem) return { ok: false, errors: { email: problem } }
  const email = normaliseEmail(address)
  if (!email) return { ok: false, errors: { email: 'emailInvalid' } }
  return {
    ok: true,
    data: {
      email,
      address,
      next: values.next.trim() || null,
      // The form's own hidden field; anything else is read as English, the site's language.
      locale: (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en',
    },
  }
}

const SIGN_IN_FORM: PublicForm<SignInValues, SignInData, SignInErrors> = {
  name: 'Sign-in link',
  limit: SIGN_IN_LIMIT,
  moreLimits: (data, secret) => emailLimits(hashLimitAddress(data.email, secret)),
  read: readSignInValues,
  parse: parseSignIn,
}

export type SignInOutcome = FormOutcome<SignInValues, SignInErrors>

/** Checks a request for a sign-in link and, if it is taken, has `deps.save` send it. */
export function handleSignInRequest(
  form: FormData,
  deps: FormDependencies<SignInData>,
): Promise<SignInOutcome> {
  return handlePublicForm(form, deps, SIGN_IN_FORM)
}

export type SignInState = FormState<SignInValues>

export const emptySignInValues = (next: string | null): SignInValues => ({
  email: '',
  next: next ?? '',
})
