import { z } from 'zod'

import { type Locale, locales } from '@/i18n/routing'
import { MAX_URL_LENGTH, canonicalUrl, hasRewrittenCharacters } from '@/lib/jobs/url'
import { SUBMISSION_KINDS, type SubmissionKind } from '@/lib/review/status'

import { NOTE_MAX, SUGGEST_FIELDS, type SuggestField } from './fields'
import { type Parse, formText } from './public-form'
import { cleanText, emailProblem } from './text'

// The "Suggest a listing" form (PLAN §3.2, §18.2): what it accepts, checked on the server. The
// browser only sends text; every message the person sees comes from here, so the form works the
// same with and without JavaScript. Limits match the Submissions collection, which checks them
// again when the suggestion is stored.

/** Each message in messages/{locale}.json under `suggest.errors`. */
export type SuggestErrorCode =
  | 'urlMissing'
  | 'urlInvalid'
  | 'urlScheme'
  | 'urlCredentials'
  | 'urlTooLong'
  | 'kindMissing'
  | 'noteTooLong'
  | 'emailInvalid'
  | 'emailTooLong'
  | 'emailMissing'
  | 'consentMissing'

/** What the person typed, as they typed it: shown again in the form after an error. */
export type SuggestValues = {
  url: string
  kind: string
  note: string
  email: string
  consent: boolean
}

export type SuggestionData = {
  url: string
  kind: SubmissionKind
  note: string | null
  email: string | null
  consentToContact: boolean
  locale: Locale
}

export type FieldErrors = Partial<Record<SuggestField, SuggestErrorCode>>

/** Reads the fields as sent. */
export function readSuggestValues(form: FormData): SuggestValues {
  return {
    url: formText(form, 'url'),
    kind: formText(form, 'kind'),
    note: formText(form, 'note'),
    email: formText(form, 'email'),
    // An unticked checkbox sends nothing; a ticked one sends its value.
    consent: form.get('consent') !== null,
  }
}

/**
 * Why an address cannot be suggested, or null. Only http and https addresses of a named host;
 * `javascript:`, `data:` and other schemes are refused, and so are sign-in details in the address
 * (`https://user:password@…`), which nobody should send us. Internationalised domain names are
 * fine. The address is stored as typed, so it may not contain what the URL parser would silently
 * drop or change (spaces, tabs, backslashes, control and text-reordering characters). The
 * canonical form (used to find duplicates, PLAN §6.3) must fit the same limit, because
 * percent-encoding can make it longer than the address as typed.
 */
export function urlProblem(value: string): SuggestErrorCode | null {
  if (value === '') return 'urlMissing'
  if (value.length > MAX_URL_LENGTH) return 'urlTooLong'
  if (hasRewrittenCharacters(value)) return 'urlInvalid'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'urlInvalid'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'urlScheme'
  if (url.username !== '' || url.password !== '') return 'urlCredentials'
  // A public page has a domain name with a dot (not "localhost" or "intranet").
  if (!url.hostname.replace(/\.$/, '').includes('.')) return 'urlInvalid'
  if ((canonicalUrl(value)?.length ?? Infinity) > MAX_URL_LENGTH) return 'urlTooLong'
  return null
}

const KINDS = SUBMISSION_KINDS.map((kind) => kind.value) as [SubmissionKind, ...SubmissionKind[]]

const schema = z
  .object({
    url: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const problem = urlProblem(value)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
    kind: z.enum(KINDS, { error: 'kindMissing' }),
    note: z
      .string()
      .transform(cleanText)
      .pipe(z.string().max(NOTE_MAX, { error: 'noteTooLong' })),
    email: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const problem = emailProblem(value)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
    consent: z.boolean(),
    // The form's own hidden field; anything else is read as English, the site's language.
    locale: z.enum(locales).catch('en'),
  })
  // The email address is stored only with consent (PLAN §3.2, §18.1). Rather than drop it
  // silently, ask: either tick the box or leave the address out, and the other way round.
  .superRefine(
    ({ email, consent }, ctx) => {
      const given = email.trim() !== ''
      if (given && !consent) {
        ctx.addIssue({ code: 'custom', path: ['consent'], message: 'consentMissing' })
      }
      if (!given && consent) {
        ctx.addIssue({ code: 'custom', path: ['email'], message: 'emailMissing' })
      }
    },
    // Also when another field has a problem, so that every problem is shown at once.
    { when: () => true },
  )

export type SuggestParse = Parse<SuggestionData, FieldErrors>

/** Checks a suggestion: the data to store, or a problem for each field that has one. */
export function parseSuggestion(values: SuggestValues, locale: string): SuggestParse {
  const result = schema.safeParse({ ...values, locale })
  if (!result.success) {
    const errors: FieldErrors = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as SuggestField
      // The first problem of each field is the one to fix first.
      if ((SUGGEST_FIELDS as readonly unknown[]).includes(field) && !errors[field]) {
        errors[field] = issue.message as SuggestErrorCode
      }
    }
    return { ok: false, errors }
  }
  const { url, kind, note, email, consent, locale: formLocale } = result.data
  return {
    ok: true,
    data: {
      url,
      kind,
      note: note === '' ? null : note,
      email: email === '' ? null : email,
      consentToContact: consent && email !== '',
      locale: formLocale,
    },
  }
}
