import { z } from 'zod'

import { type Locale, locales } from '@/i18n/routing'
import { type ItemRef, parseItemRef } from '@/lib/reports/item'
import { PERSONAL_RIGHTS, REPORT_KINDS, type ReportKind } from '@/lib/reports/status'

import { DETAILS_MAX, FORM_INPUTS, REPORT_FIELDS, type ReportField } from './fields'
import { type Parse, formText } from './public-form'
import { cleanText, emailProblem } from './text'

// The "Report a problem" form (PLAN §3.2, §7.5, §15.4): what it accepts, checked on the server.
// As for "Suggest a listing", every message comes from here, so the form works the same with and
// without JavaScript. Limits match the Reports collection, which checks them again.

/** Each message in messages/{locale}.json under `report.errors`. */
export type ReportErrorCode =
  | 'kindMissing'
  | 'detailsMissing'
  | 'detailsTooLong'
  | 'emailInvalid'
  | 'emailTooLong'
  | 'emailRequired'

/** What the person sent, as they typed it: shown again in the form after an error. */
export type ReportValues = {
  kind: string
  details: string
  email: string
  /** The item from the page's address (`job:{shortId}`), in a hidden input. */
  item: string
}

export type ReportData = {
  kind: ReportKind
  details: string
  email: string | null
  locale: Locale
  /** Checked against the database when the report is stored (src/lib/forms/report.ts). */
  item: ItemRef | null
}

export type ReportErrors = Partial<Record<ReportField, ReportErrorCode>>

/** Reads the fields as sent. */
export function readReportValues(form: FormData): ReportValues {
  return {
    kind: formText(form, 'kind'),
    details: formText(form, 'details'),
    email: formText(form, 'email'),
    item: formText(form, FORM_INPUTS.item),
  }
}

const KINDS = REPORT_KINDS.map((kind) => kind.value) as [ReportKind, ...ReportKind[]]

const schema = z
  .object({
    kind: z.enum(KINDS, { error: 'kindMissing' }),
    details: z
      .string()
      .transform(cleanText)
      .pipe(
        z
          .string()
          .min(1, { error: 'detailsMissing' })
          .max(DETAILS_MAX, { error: 'detailsTooLong' }),
      ),
    email: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const problem = emailProblem(value)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
      }),
    // A malformed item is ignored: the report still arrives, without it.
    item: z.string().transform(parseItemRef),
    // The form's own hidden field; anything else is read as English, the site's language.
    locale: z.enum(locales).catch('en'),
  })
  // A request about personal rights needs an answer (Law 5651 Art. 9, PLAN §15.1), so it needs
  // an address to answer to; for other reports the address is optional.
  .superRefine(
    ({ kind, email }, ctx) => {
      if (kind === PERSONAL_RIGHTS && email === '') {
        ctx.addIssue({ code: 'custom', path: ['email'], message: 'emailRequired' })
      }
    },
    // Only once the kind is known; the address's own problems come first.
    { when: (payload) => (payload.value as { kind?: unknown }).kind === PERSONAL_RIGHTS },
  )

/** Checks a report: the data to store, or a problem for each field that has one. */
export function parseReport(values: ReportValues, locale: string): Parse<ReportData, ReportErrors> {
  const result = schema.safeParse({ ...values, locale })
  if (!result.success) {
    const errors: ReportErrors = {}
    for (const issue of result.error.issues) {
      const field = issue.path[0] as ReportField
      // The first problem of each field is the one to fix first.
      if ((REPORT_FIELDS as readonly unknown[]).includes(field) && !errors[field]) {
        errors[field] = issue.message as ReportErrorCode
      }
    }
    return { ok: false, errors }
  }
  const { kind, details, email, item, locale: formLocale } = result.data
  return {
    ok: true,
    data: { kind, details, email: email === '' ? null : email, locale: formLocale, item },
  }
}
