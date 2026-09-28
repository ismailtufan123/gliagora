import type { CollectionBeforeValidateHook, CollectionConfig, Field, PayloadRequest } from 'payload'
import { validations } from 'payload'

import { fixedFieldHooks } from '@/lib/fixed-fields'
import { keepOutOfLists } from '@/lib/private-fields'
import {
  OTHER_ANSWER_DAYS,
  PERSONAL_RIGHTS,
  PERSONAL_RIGHTS_ANSWER_HOURS,
  REPORT_ACTIONS,
  REPORT_KINDS,
  REPORT_RETENTION_YEARS,
  REPORT_STATUSES,
  type ReportStatus,
  closing,
  respondBy,
  statusProblem,
} from '@/lib/reports/status'
import type { Report } from '@/payload-types'

type ReportData = Partial<Report>

/** What Payload passes to a field's validate function, as far as these rules use it. */
type Options = {
  data: ReportData
  operation?: string
  previousValue?: unknown
  req: PayloadRequest
}

/** The longest email address that can be delivered (RFC 5321). */
const MAX_EMAIL_LENGTH = 254
/** The longest details, as on the form (src/lib/forms/fields.ts). */
const MAX_DETAILS_LENGTH = 2000

/** What the person sent: fixed once stored, also for code that bypasses access control. */
const FROM_FORM = ['kind', 'job', 'itemUrl', 'details', 'email', 'locale'] as const
const fixed = fixedFieldHooks('reports', FROM_FORM)

/** Personal data: never a list column, and never loaded by the list. */
const PRIVATE_FIELDS = ['email', 'details', 'actionNote'] as const

// Fills in what nobody types: when the report was received, when it must be answered, and, once
// it is closed, when it was closed and when it is deleted. Runs for every save, including the
// form's, which creates reports through the local API.
const prepare: CollectionBeforeValidateHook<Report> = ({ data, originalDoc, operation }) => {
  if (!data) return data
  const now = new Date()
  const saved: ReportData = operation === 'update' ? (originalDoc ?? {}) : {}
  const value = <K extends keyof Report>(key: K): Report[K] | undefined =>
    key in data ? (data as Report)[key] : saved[key]

  if (operation === 'create') {
    if (typeof data.details === 'string') data.details = data.details.trim()
    if (typeof data.email === 'string') data.email = data.email.trim() || null
    // The time it was received is when it was stored (createdAt), and the answer is due from then.
    data.createdAt = now.toISOString()
  }
  const receivedAt = value('createdAt') ?? now.toISOString()
  data.respondBy = respondBy(value('kind'), receivedAt)
  Object.assign(data, closing(saved, (value('status') ?? 'new') as ReportStatus, now))
  return data
}

/** Given by the person who sent it, and never changed by editors. */
const fromForm = (field: Field): Field =>
  ({
    ...field,
    access: { update: () => false },
    admin: { ...field.admin, readOnly: true },
  }) as Field

const sidebarDate = (name: string, label: string, description: string): Field => ({
  name,
  label,
  type: 'date',
  index: true,
  // Set by the hooks, and by the email task (src/jobs/maintenance/acknowledgeReports.ts), only.
  access: { create: () => false, update: () => false },
  admin: {
    position: 'sidebar',
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
    description,
  },
})

// PLAN §5.1 (TakedownRequest), §3.2, §7.5, §15.1: reports from the public "Report a problem"
// form (/en/report/): wrong facts, closed positions, broken links, agency postings, and requests
// to remove or correct content about a person (Law 5651 Art. 9). Created only by the form;
// editors handle them here and close them with what they did.
//
// No versions: a report holds personal data (the email address and the details), and the 2-year
// deletion (the retention task, M4.7) removes the whole record; versions would keep copies of it. If versions are ever
// switched on, that deletion must remove the report's versions too (`_reports_v`), as the
// candidates' purge does for their source text.
export const Reports: CollectionConfig = {
  slug: 'reports',
  labels: { singular: 'Report or request', plural: 'Reports and requests' },
  admin: {
    group: 'Review queue',
    // Never a column for the email address, the details or the note: they are personal data. The
    // list loads only its columns (Payload's select API), and the keepOutOfLists hook drops these
    // fields from any column list, also one from ?columns= or a saved preference, so they are not
    // sent to the list page either; an editor sees them only by opening a report.
    enableListViewSelectAPI: true,
    defaultColumns: ['kind', 'status', 'respondBy', 'job', 'createdAt'],
    listSearchableFields: ['itemUrl'],
    description: `Reports from the "Report a problem" form, newest first. Requests about personal rights (Law 5651 Art. 9) are answered within ${PERSONAL_RIGHTS_ANSWER_HOURS} hours and usually decided within 72 hours (the notice and takedown page); other reports within ${OTHER_ANSWER_DAYS} days. Set a report to In progress once you have answered the person or started checking (a personal-rights request only once you have answered the person: until then the dashboard counts it as waiting for its ${PERSONAL_RIGHTS_ANSWER_HOURS}-hour answer), and close it with what you did: to remove a listing, withdraw the job itself. The email address and details are deleted with the report ${REPORT_RETENTION_YEARS} years after it is closed, by the nightly retention task. A report sent with an email address gets an automatic acknowledgement within minutes, once email is set up (M2). To answer a data request, filter by Email, then delete.`,
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-createdAt',
  access: {
    // Created only by the form, through the local API; never through the API or the admin.
    create: () => false,
    // Signed-in editors, to answer data requests (PLAN §3.2, §18.1). A function replaces
    // Payload's default, so it checks the user itself.
    delete: ({ req }) => Boolean(req.user),
  },
  disableDuplicate: true,
  hooks: {
    beforeOperation: [keepOutOfLists(PRIVATE_FIELDS)],
    beforeValidate: [...fixed.beforeValidate, prepare],
    beforeChange: fixed.beforeChange,
  },
  fields: [
    fromForm({
      name: 'kind',
      label: 'What is wrong',
      type: 'select',
      required: true,
      index: true,
      options: REPORT_KINDS.map(({ value, label }) => ({ value, label })),
      admin: { description: 'As the person chose it on the form.' },
    }),
    {
      type: 'row',
      fields: [
        fromForm({
          name: 'job',
          label: 'Job',
          type: 'relationship',
          relationTo: 'jobs',
          admin: {
            description: 'The job the report is about, when it was sent from a job page.',
          },
        }),
        fromForm({
          name: 'itemUrl',
          label: 'Page reported',
          type: 'text',
          maxLength: 2000,
          admin: { description: 'The address of that page when the report was sent.' },
        }),
      ],
    },
    fromForm({
      name: 'details',
      type: 'textarea',
      required: true,
      maxLength: MAX_DETAILS_LENGTH,
      admin: {
        disableListColumn: true,
        description: `From the person who sent it. Deleted with the report ${REPORT_RETENTION_YEARS} years after it is closed.`,
      },
    }),
    {
      type: 'row',
      fields: [
        fromForm({
          name: 'email',
          type: 'email',
          validate: (value: string | null | undefined, options: Options) => {
            if (!value && options.data.kind === PERSONAL_RIGHTS) {
              return 'A request about personal rights needs an email address to answer to.'
            }
            return value && value.length > MAX_EMAIL_LENGTH
              ? 'This email address is too long.'
              : validations.email(value, options as never)
          },
          admin: {
            disableListColumn: true,
            description: `Only to answer the person about this report. Required for personal-rights requests. Deleted with the report ${REPORT_RETENTION_YEARS} years after it is closed.`,
          },
        }),
        fromForm({
          name: 'locale',
          label: 'Language of the form',
          type: 'select',
          required: true,
          defaultValue: 'en',
          options: [
            { value: 'en', label: 'English' },
            { value: 'tr', label: 'Türkçe' },
          ],
        }),
      ],
    },
    {
      name: 'actionNote',
      label: 'Note on what was done',
      type: 'textarea',
      maxLength: 2000,
      admin: {
        disableListColumn: true,
        description:
          'For editors only; never shown on the site or sent to the person. Say what you checked and what you answered.',
      },
    },

    // Sidebar
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: REPORT_STATUSES.map(({ value, label }) => ({ value, label })),
      validate: (value: string | null | undefined, options: Options) => {
        const { operation, previousValue } = options
        // In the admin form, the saved status is known once the form has loaded.
        if (operation === 'create' || previousValue !== undefined) {
          const from = operation === 'create' ? undefined : (previousValue as ReportStatus | null)
          const problem = statusProblem(from, (value ?? 'new') as ReportStatus)
          if (problem) return problem
        }
        return validations.select(value as never, options as never)
      },
      admin: {
        position: 'sidebar',
        description: `New: nobody has answered or looked at it yet. In progress: you have answered the person or started checking; a personal-rights request stays New until you have answered the person, so the dashboard keeps it in the ${PERSONAL_RIGHTS_ANSWER_HOURS}-hour count. Closed: decided, with what you did.`,
      },
    },
    {
      name: 'action',
      label: 'What was done',
      type: 'select',
      options: REPORT_ACTIONS.map(({ value, label }) => ({ value, label })),
      validate: (value: string | null | undefined, options: Options) =>
        !value && options.data.status === 'closed'
          ? 'Choose what was done before closing the report.'
          : validations.select(value as never, options as never),
      admin: {
        position: 'sidebar',
        description: 'Required to close the report.',
      },
    },
    // Payload's own timestamp, shown under the name the plan gives it (receivedAt).
    sidebarDate('createdAt', 'Received', 'When the report arrived; the answer is due from then.'),
    sidebarDate(
      'respondBy',
      'Answer by',
      `${PERSONAL_RIGHTS_ANSWER_HOURS} hours after it was received for a personal-rights request, ${OTHER_ANSWER_DAYS} days for other reports.`,
    ),
    sidebarDate(
      'ackSentAt',
      'Acknowledgement emailed',
      'When the automatic acknowledgement was emailed to the person. Empty while no mail server is set up.',
    ),
    sidebarDate('closedAt', 'Closed', 'When the report was closed.'),
    sidebarDate(
      'purgeAt',
      'Deleted on',
      `The report, with the email address and details, is deleted ${REPORT_RETENTION_YEARS} years after it was closed (PLAN §18.1), by the nightly retention task.`,
    ),
  ],
}
