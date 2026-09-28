import { z } from 'zod'

import { type Locale, locales } from '@/i18n/routing'
import { MAX_URL_LENGTH, canonicalUrl, hasRewrittenCharacters } from '@/lib/jobs/url'
import { SUBMISSION_KINDS, type SubmissionKind } from '@/lib/review/status'

import { EMAIL_MAX, NOTE_MAX, SUGGEST_FIELDS, SUGGEST_INPUTS, type SuggestField } from './fields'

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

/** A form field's text; anything else (a file, a missing field) counts as empty. */
function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/** Reads the form as sent. */
export function readSuggestForm(form: FormData) {
  return {
    values: {
      url: text(form, 'url'),
      kind: text(form, 'kind'),
      note: text(form, 'note'),
      email: text(form, 'email'),
      // An unticked checkbox sends nothing; a ticked one sends its value.
      consent: form.get('consent') !== null,
    } satisfies SuggestValues,
    locale: text(form, SUGGEST_INPUTS.locale),
    altcha: text(form, SUGGEST_INPUTS.altcha),
    honeypot: text(form, SUGGEST_INPUTS.honeypot),
  }
}

// Control characters (C0 except tab and line feed, DEL, C1) and the invisible characters that
// reorder text (bidirectional overrides and isolates), which could make a note look different in
// the admin than what was sent.
const UNWANTED = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g

/**
 * A note as plain text: line breaks as "\n" (browsers send them as "\r\n", but count them as one
 * character), without control characters, trimmed.
 */
export function cleanNote(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(UNWANTED, '').trim()
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

/**
 * The email check of Payload's email fields (payload/dist/fields/validations.js), so that nothing
 * passes here that the Submissions collection would refuse: no spaces or quotes, no double dots,
 * a domain with a top-level domain of two or more letters.
 */
const EMAIL =
  /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

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
      .transform(cleanNote)
      .pipe(z.string().max(NOTE_MAX, { error: 'noteTooLong' })),
    email: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        if (value.length > EMAIL_MAX) ctx.addIssue({ code: 'custom', message: 'emailTooLong' })
        else if (value !== '' && !EMAIL.test(value)) {
          ctx.addIssue({ code: 'custom', message: 'emailInvalid' })
        }
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

export type SuggestParse = { ok: true; data: SuggestionData } | { ok: false; errors: FieldErrors }

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
