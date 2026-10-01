import type { CollectionBeforeValidateHook, CollectionConfig, Field, PayloadRequest } from 'payload'
import { validations } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { DATA_REQUEST_KINDS, DATA_REQUEST_SOURCES } from '@/lib/data-requests/kinds'
import {
  DATA_REQUEST_ACTIONS,
  DATA_REQUEST_STATUSES,
  type DataRequestStatus,
  actionProblem,
  requestDates,
  statusProblem,
} from '@/lib/data-requests/status'
import { fixedFieldHooks } from '@/lib/fixed-fields'
import { normaliseEmail } from '@/lib/members/email-address'
import { keepOutOfLists } from '@/lib/private-fields'
import {
  DATA_REQUEST_ANSWER_DAYS,
  DATA_REQUEST_RETENTION_YEARS,
  UNCONFIRMED_REQUEST_DAYS,
} from '@/lib/retention/rules'
import type { DataRequest } from '@/payload-types'

type RequestData = Partial<DataRequest>

/** What Payload passes to a field's validate function, as far as these rules use it. */
type Options = {
  data: RequestData
  operation?: string
  previousValue?: unknown
  req: PayloadRequest
}

/** The longest email address that can be delivered (RFC 5321). */
const MAX_EMAIL_LENGTH = 254

/** Fixed once the request is recorded, also for code that bypasses access control. */
const FIXED = ['kind', 'source', 'emailHash', 'locale', 'receivedAt'] as const
const fixed = fixedFieldHooks('data-requests', FIXED)

/**
 * What the person wrote: stored only once they confirm the request (the form's record holds none
 * of it until then), and never changed afterwards.
 */
const ONCE = ['email', 'name', 'details'] as const
const once = fixedFieldHooks('data-requests', ONCE, { untilSet: true })

/** Personal data: never a list column, and never loaded by the list. */
const PRIVATE_FIELDS = ['email', 'name', 'details', 'actionNote'] as const

/** A signed-in editor, in the admin or through the API; the site's own code has no user. */
const byEditor = (req: PayloadRequest) => Boolean(req.user)

// Fills in what nobody types: where a request recorded by an editor came from (an email), when it
// was received, when it must be answered, when it was closed and when it is deleted. Runs for
// every save, including the site's own (the form, the account settings), through the local API.
const prepare: CollectionBeforeValidateHook<DataRequest> = ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data
  const now = new Date()
  const saved: RequestData = operation === 'update' ? (originalDoc ?? {}) : {}
  const value = <K extends keyof DataRequest>(key: K): DataRequest[K] | undefined =>
    key in data ? (data as DataRequest)[key] : saved[key]

  if (operation === 'create') {
    // Editors record the requests that arrive by email; the form and the account settings record
    // their own through the local API, with their source.
    if (byEditor(req)) data.source = 'email'
    data.receivedAt = data.receivedAt ?? now.toISOString()
  }
  if (typeof data.email === 'string') data.email = normaliseEmail(data.email) ?? data.email.trim()
  if (typeof data.name === 'string') data.name = data.name.trim() || null
  if (typeof data.details === 'string') data.details = data.details.trim() || null
  const status = (value('status') ?? 'new') as DataRequestStatus
  Object.assign(data, requestDates(saved, status, value('receivedAt') ?? now.toISOString(), now))
  return data
}

/** Set by the site, never typed by an editor. */
const bySite = (field: Field): Field =>
  ({
    ...field,
    access: { create: () => false, update: () => false },
    admin: { ...field.admin, readOnly: true },
  }) as Field

/** Typed by an editor who records an emailed request; fixed afterwards. */
const asReceived = (field: Field): Field => ({ ...field, access: { update: () => false } }) as Field

const sidebarDate = (name: string, label: string, description: string): Field =>
  bySite({
    name,
    label,
    type: 'date',
    index: true,
    admin: {
      position: 'sidebar',
      date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      description,
    },
  })

// PLAN §3.2, §5.1 (DataRequest), §15.1, §18.1; M4b, D8, D49: requests about a person's own data.
// Emails to privacy@, which editors record here and answer within 30 days, closing them with what
// they did; "Delete my account" in a member's privacy settings (done at once, recorded closed by
// src/lib/members/account-deletion.ts; the final email goes out from the record,
// `sendRequestEmails`). Later in M4b (the M4b design §7.8): the form on /en/legal/data-requests/
// (recorded at once, acted on only after the person confirms it with the link in our email; a
// confirmed deletion is done by the site itself).
//
// No versions: a request holds personal data, and the retention task deletes the whole record, 2
// years after it was closed, or 60 days after it arrived if nobody confirmed it
// (src/jobs/maintenance/purgeRetention.ts). Editors never delete one (a request recorded
// by mistake is closed as "Not applicable"): the record is the proof that the request was handled,
// and a restore keeps the table's rows (deploy/backup/restore.sh carries them over, the M4b design
// §7.9).
export const DataRequests: CollectionConfig = {
  slug: 'data-requests',
  labels: { singular: 'Data request', plural: 'Data requests' },
  admin: {
    group: 'Review queue',
    // Never a column for the email address, the name, the details or the note: they are personal
    // data (keepOutOfLists, as for reports).
    enableListViewSelectAPI: true,
    defaultColumns: ['kind', 'status', 'respondBy', 'source', 'receivedAt'],
    description: `Requests about a person's own data, newest first. To record a request that arrived by email, create one here with the date it arrived. Answer each request within ${DATA_REQUEST_ANSWER_DAYS} days of receipt, then close it with what you did. Requests are kept for ${DATA_REQUEST_RETENTION_YEARS} years after they are closed and are never deleted by hand (close a mistaken one as Not applicable).`,
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-receivedAt',
  access: {
    // Personal data: signed-in editors only.
    read: signedIn,
    // Editors record requests that arrive by email (the hook sets their source). The site's own
    // code records the others through the local API.
    create: signedIn,
    update: signedIn,
    // Nobody: only the retention task deletes a request, 2 years after it is closed (PLAN §18.1).
    delete: nobody,
  },
  disableDuplicate: true,
  hooks: {
    beforeOperation: [keepOutOfLists(PRIVATE_FIELDS)],
    beforeValidate: [...fixed.beforeValidate, ...once.beforeValidate, prepare],
    beforeChange: [...fixed.beforeChange, ...once.beforeChange],
  },
  fields: [
    asReceived({
      name: 'kind',
      label: 'What the person asks for',
      type: 'select',
      required: true,
      index: true,
      options: DATA_REQUEST_KINDS.map(({ value, label }) => ({ value, label })),
    }),
    {
      type: 'row',
      fields: [
        asReceived({
          name: 'email',
          type: 'email',
          validate: (value: string | null | undefined, options: Options) => {
            if (!value && options.data.source === 'email') {
              return 'Enter the address the request came from, to answer it.'
            }
            return value && value.length > MAX_EMAIL_LENGTH
              ? 'This email address is too long.'
              : validations.email(value, options as never)
          },
          admin: {
            disableListColumn: true,
            description:
              'The address the request came from. Empty until the person confirms a request from the form.',
          },
        }),
        asReceived({
          name: 'name',
          type: 'text',
          maxLength: 200,
          admin: {
            disableListColumn: true,
            description: 'Optional; not kept for deletion requests.',
          },
        }),
        asReceived({
          name: 'locale',
          label: 'Language',
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
    asReceived({
      name: 'details',
      type: 'textarea',
      maxLength: 2000,
      admin: {
        disableListColumn: true,
        description: 'What the person wrote. Empty until a request from the form is confirmed.',
      },
    }),
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
    bySite({
      // Counts only, never what was deleted: suggestionsDeleted, accountDeleted (0 or 1),
      // reportAddressesCleared, personalRightsReportsKept.
      name: 'outcome',
      label: 'What the site deleted',
      type: 'json',
      admin: { description: 'Counts from an automatic deletion.' },
    }),

    // Sidebar
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: DATA_REQUEST_STATUSES.map(({ value, label }) => ({ value, label })),
      validate: (value: string | null | undefined, options: Options) => {
        const { operation, previousValue, req } = options
        // In the admin form, the saved status is known once the form has loaded.
        if (operation === 'create' || previousValue !== undefined) {
          const from =
            operation === 'create' ? undefined : (previousValue as DataRequestStatus | null)
          const problem = statusProblem(from, (value ?? 'new') as DataRequestStatus, byEditor(req))
          if (problem) return problem
        }
        return validations.select(value as never, options as never)
      },
      admin: {
        position: 'sidebar',
        description:
          'Not confirmed yet: the person has not opened the link in our email; nothing is done until they do. New: confirmed, nobody has answered yet. In progress: you have answered the person or started. Closed: done, with what you did.',
      },
    },
    {
      name: 'action',
      label: 'What was done',
      type: 'select',
      options: DATA_REQUEST_ACTIONS.map(({ value, label }) => ({ value, label })),
      validate: (value: string | null | undefined, options: Options) => {
        if (!value && options.data.status === 'closed') {
          return 'Choose what was done before closing the request.'
        }
        const problem = actionProblem(
          options.previousValue as string | null | undefined,
          value,
          byEditor(options.req),
        )
        return problem ?? validations.select(value as never, options as never)
      },
      admin: { position: 'sidebar', description: 'Required to close the request.' },
    },
    bySite({
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'form',
      index: true,
      options: DATA_REQUEST_SOURCES.map(({ value, label }) => ({ value, label })),
      admin: { position: 'sidebar' },
    }),
    asReceived({
      name: 'receivedAt',
      label: 'Received',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        description: `When the request arrived (for an email: when it reached the mailbox). The answer is due ${DATA_REQUEST_ANSWER_DAYS} days later.`,
      },
    }),
    sidebarDate(
      'respondBy',
      'Answer by',
      `${DATA_REQUEST_ANSWER_DAYS} days after it was received, once confirmed (KVKK Art. 13).`,
    ),
    sidebarDate('closedAt', 'Closed', 'When the request was closed.'),
    sidebarDate(
      'purgeAt',
      'Deleted on',
      `When the request is due to be deleted: ${DATA_REQUEST_RETENTION_YEARS} years after it was closed; for one never confirmed, ${UNCONFIRMED_REQUEST_DAYS} days after it arrived.`,
    ),
    sidebarDate(
      'confirmationSentAt',
      'Confirmation emailed',
      'When the person was emailed that their data was deleted. Empty while no mail server is set up.',
    ),
    bySite({
      // HMAC of the address the form was sent from, so a request can be found from an address
      // the person gives (src/lib/data-requests/address.ts) while it keeps no address itself.
      name: 'emailHash',
      label: 'Address code',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        disableListColumn: true,
        description:
          'A scrambled code of the address a form request was sent from; the technical administrator can work it out from an address.',
      },
    }),
  ],
}
