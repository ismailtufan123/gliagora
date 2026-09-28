import { type ItemLookup, type ReportItem, findReportItem } from '@/lib/reports/item'
import type { ReportKind } from '@/lib/reports/status'

import {
  type FormDependencies,
  type FormOutcome,
  type FormState,
  type PublicForm,
  handlePublicForm,
} from './public-form'
import { REPORT_LIMIT } from './rate-limit'
import {
  type ReportData,
  type ReportErrors,
  type ReportValues,
  parseReport,
  readReportValues,
} from './report-schema'

// What happens when someone sends "Report a problem" (PLAN §3.2, §7.5, §15.1): the checks of
// every public form (src/lib/forms/public-form.ts) with this form's fields and its own rate
// limit (5 reports an hour per hashed IP address, apart from suggestions). The Server Action
// (src/app/(frontend)/en/report/actions.ts) passes in what this needs, so tests can too.

/** Where the form leads once a report is taken, or seems to be (the hidden field). */
export const REPORT_SENT_PATH = '/en/report/sent/'

/** The parts of the legal texts the form links to (headings in content/…, see markdown.ts). */
export const REPORT_LEGAL_LINKS = {
  takedown: '/en/legal/takedown/',
  privacy: '/en/legal/privacy/#removal-requests-corrections-and-report-a-problem',
  spamProtection: '/en/legal/privacy/#spam-protection-on-forms',
  kvkk: '/tr/legal/kvkk-aydinlatma-metni/#sorun-bildirimleri-duzeltme-ve-kaldirma-talepleri',
} as const

export type ReportOutcome = FormOutcome<ReportValues, ReportErrors>

export type ReportDependencies = FormDependencies<ReportData>

const REPORT_FORM: PublicForm<ReportValues, ReportData, ReportErrors> = {
  name: 'Report',
  limit: REPORT_LIMIT,
  read: readReportValues,
  parse: parseReport,
}

/** Checks a report and, if it is taken, stores it. */
export function handleReport(form: FormData, deps: ReportDependencies): Promise<ReportOutcome> {
  return handlePublicForm(form, deps, REPORT_FORM)
}

/** What the Reports collection stores for a report. */
export type ReportRecord = {
  kind: ReportKind
  details: string
  email: string | null
  locale: ReportData['locale']
  job: number | null
  institution: number | null
  itemUrl: string | null
  status: 'new'
}

/**
 * The record of a report. The item named by the form is looked up again, since it may have
 * changed since the form was shown: a report names only a public job or an existing institution
 * (findReportItem), with the address its page had, and is kept without the item otherwise. What
 * it finds is always of the type the form named, so the kind still fits it (report-schema.ts).
 */
export async function reportRecord(
  data: ReportData,
  lookup: ItemLookup,
  now: Date,
): Promise<ReportRecord> {
  const item = await findReportItem(data.item, lookup, now)
  return {
    kind: data.kind,
    details: data.details,
    email: data.email,
    locale: data.locale,
    job: item?.type === 'job' ? item.id : null,
    institution: item?.type === 'institution' ? item.id : null,
    itemUrl: item?.path ?? null,
    status: 'new',
  }
}

export type ReportState = FormState<ReportValues>

export const emptyReportValues = (item: ReportItem | null): ReportValues => ({
  kind: '',
  details: '',
  email: '',
  item: item?.ref ?? '',
})
