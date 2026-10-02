import { z } from 'zod'

import { type Locale, locales } from '@/i18n/routing'
import { normaliseEmail } from '@/lib/members/email-address'

import { NEWSLETTER_FIELDS, type NewsletterField } from './fields'
import { type Parse, formText } from './public-form'
import { emailProblem } from './text'

// The Glia Notes signup (M2, D50; PLAN §9.10, §13): what it accepts, checked on the server, so the
// form works the same with and without JavaScript. An address, stored in the form the link proves
// (normaliseEmail), and the unticked consent box, which must be ticked: the consent itself is
// recorded only once the person confirms by the emailed link (src/lib/newsletter/confirm.ts).

/** Each message in messages/{locale}.json under `newsletter.errors`. */
export type NewsletterErrorCode =
  'emailMissing' | 'emailInvalid' | 'emailTooLong' | 'consentMissing'

/** What the person sent, as they typed it: shown again in the form after an error. */
export type NewsletterValues = { email: string; consent: boolean }

export type NewsletterData = {
  /** In its stored form (normaliseEmail): where the link goes, and what it proves. */
  email: string
  locale: Locale
}

export type NewsletterErrors = Partial<Record<NewsletterField, NewsletterErrorCode>>

/** Reads the fields as sent. */
export function readNewsletterValues(form: FormData): NewsletterValues {
  return {
    email: formText(form, 'email'),
    // An unticked checkbox sends nothing; a ticked one sends its value.
    consent: form.get('consent') !== null,
  }
}

const schema = z.object({
  email: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const problem = value === '' ? 'emailMissing' : emailProblem(value)
      if (problem) ctx.addIssue({ code: 'custom', message: problem })
    }),
  consent: z.literal(true, { error: 'consentMissing' }),
  // The form's own hidden field; anything else is read as English, the site's language.
  locale: z.enum(locales).catch('en'),
})

/** Checks a signup: the data to store, or a problem for each field that has one. */
export function parseNewsletter(
  values: NewsletterValues,
  locale: string,
): Parse<NewsletterData, NewsletterErrors> {
  const result = schema.safeParse({ ...values, locale })
  if (!result.success) {
    const errors: NewsletterErrors = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as NewsletterField
      // The first problem of each field is the one to fix first.
      if ((NEWSLETTER_FIELDS as readonly unknown[]).includes(field) && !errors[field]) {
        errors[field] = issue.message as NewsletterErrorCode
      }
    }
    return { ok: false, errors }
  }
  const email = normaliseEmail(result.data.email)
  if (!email) return { ok: false, errors: { email: 'emailInvalid' } }
  return { ok: true, data: { email, locale: result.data.locale } }
}
