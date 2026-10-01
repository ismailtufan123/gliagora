import { z } from 'zod'

import { type Locale, locales } from '@/i18n/routing'
import { DATA_REQUEST_KINDS, type DataRequestKind } from '@/lib/data-requests/kinds'
import { normaliseEmail } from '@/lib/members/email-address'

import { DATA_REQUEST_FIELDS, DETAILS_MAX, type DataRequestField, NAME_MAX } from './fields'
import { type Parse, formText } from './public-form'
import { cleanText, emailProblem } from './text'

// The data-request form (M4b, D49; the M4b design §7.8): what it accepts, checked on the server.
// As for the other public forms, every message comes from here, so the form works the same with
// and without JavaScript. The address is where the confirmation link goes, so it is required, and
// stored in the form the link proves (normaliseEmail). The details say what the person asks for:
// required, except for a deletion, which deletes what the confirmation page lists. A deletion keeps
// neither the name nor the details (the form says so): the site does it by itself, and nobody reads
// them. Limits match the data-requests collection, which checks them again.

/** Each message in messages/{locale}.json under `dataRequest.errors`. */
export type DataRequestErrorCode =
  | 'emailMissing'
  | 'emailInvalid'
  | 'emailTooLong'
  | 'kindMissing'
  | 'nameTooLong'
  | 'detailsMissing'
  | 'detailsTooLong'

/** What the person sent, as they typed it: shown again in the form after an error. */
export type DataRequestValues = {
  email: string
  kind: string
  name: string
  details: string
}

export type DataRequestData = {
  /** In its stored form (normaliseEmail): where the link goes, and what it proves. */
  email: string
  kind: DataRequestKind
  /** Null for a deletion, which keeps no name. */
  name: string | null
  /** Null for a deletion, which keeps no details. */
  details: string | null
  locale: Locale
}

export type DataRequestErrors = Partial<Record<DataRequestField, DataRequestErrorCode>>

/** Reads the fields as sent. */
export function readDataRequestValues(form: FormData): DataRequestValues {
  return {
    email: formText(form, 'email'),
    kind: formText(form, 'kind'),
    name: formText(form, 'name'),
    details: formText(form, 'details'),
  }
}

const KINDS = DATA_REQUEST_KINDS.map((kind) => kind.value) as [
  DataRequestKind,
  ...DataRequestKind[],
]

/** A name on one line: plain text, inner runs of white space (also line breaks) as one space. */
const oneLine = (value: string) => cleanText(value).replace(/\s+/g, ' ')

const schema = z
  .object({
    email: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const problem = value === '' ? 'emailMissing' : emailProblem(value)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
    kind: z.enum(KINDS, { error: 'kindMissing' }),
    name: z
      .string()
      .transform(oneLine)
      .pipe(z.string().max(NAME_MAX, { error: 'nameTooLong' })),
    // Checked for its length whatever the kind, so the count under the field always holds.
    details: z
      .string()
      .transform(cleanText)
      .pipe(z.string().max(DETAILS_MAX, { error: 'detailsTooLong' })),
    // The form's own hidden field; anything else is read as English, the site's language.
    locale: z.enum(locales).catch('en'),
  })
  // Every request but a deletion needs to say what it asks for; a deletion deletes what the
  // confirmation page lists.
  .superRefine(
    ({ kind, details }, ctx) => {
      if (kind !== 'deletion' && details === '') {
        ctx.addIssue({ code: 'custom', path: ['details'], message: 'detailsMissing' })
      }
    },
    // Once the kind is known (also when another field has a problem, so that every problem is
    // shown at once).
    {
      when: (payload) =>
        (KINDS as readonly unknown[]).includes((payload.value as { kind?: unknown }).kind),
    },
  )

/** Checks a data request: the data to store, or a problem for each field that has one. */
export function parseDataRequest(
  values: DataRequestValues,
  locale: string,
): Parse<DataRequestData, DataRequestErrors> {
  const result = schema.safeParse({ ...values, locale })
  if (!result.success) {
    const errors: DataRequestErrors = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as DataRequestField
      // The first problem of each field is the one to fix first.
      if ((DATA_REQUEST_FIELDS as readonly unknown[]).includes(field) && !errors[field]) {
        errors[field] = issue.message as DataRequestErrorCode
      }
    }
    return { ok: false, errors }
  }
  const { kind, name, details, locale: formLocale } = result.data
  const email = normaliseEmail(result.data.email)
  if (!email) return { ok: false, errors: { email: 'emailInvalid' } }
  const deletion = kind === 'deletion'
  return {
    ok: true,
    data: {
      email,
      kind,
      name: deletion || name === '' ? null : name,
      details: deletion || details === '' ? null : details,
      locale: formLocale,
    },
  }
}
