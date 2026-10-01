import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
  PayloadRequest,
} from 'payload'
import { validations } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { addressProblem } from '@/lib/jobs/url'
import { keepOutOfLists } from '@/lib/private-fields'
import { idOf } from '@/lib/relationship'
import {
  CANDIDATE_KIND_OF,
  SUBMISSION_KINDS,
  SUBMISSION_RETENTION_DAYS,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
  submissionState,
} from '@/lib/review/status'
import type { Submission } from '@/payload-types'

import { logDeletions } from './DeletionLog'

type SubmissionData = Partial<Submission>

/** What Payload passes to a field's validate function, as far as these rules use it. */
type Options = { data: SubmissionData; req: PayloadRequest }

/** The longest email address that can be delivered (RFC 5321). */
const MAX_EMAIL_LENGTH = 254

// Fills in what nobody types: the status and decision time (from the candidate when there is
// one) and the day the personal data is deleted (D34). Runs for every save, including the form's
// (M4.5), which creates suggestions through the local API.
const prepare: CollectionBeforeValidateHook<Submission> = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data
  const saved: SubmissionData = operation === 'update' ? (originalDoc ?? {}) : {}
  const value = <K extends keyof Submission>(key: K): Submission[K] | undefined =>
    key in data ? (data as Submission)[key] : saved[key]

  if (typeof data.url === 'string') data.url = data.url.trim()
  if (typeof data.note === 'string') data.note = data.note.trim() || null
  if (typeof data.email === 'string') data.email = data.email.trim() || null
  // An email address given without ticking the consent box is never stored (PLAN §3.2, §18.1).
  if (value('consentToContact') !== true) data.email = null

  // The candidate is linked by code (the hooks here and in Candidates.ts) and then stays.
  if (operation === 'update' && data.candidate === undefined) {
    data.candidate = saved.candidate ?? null
  }
  const candidateId = idOf(value('candidate'))
  const candidate =
    candidateId === undefined
      ? null
      : await req.payload.findByID({
          collection: 'candidates',
          id: candidateId,
          select: { status: true, decidedAt: true },
          depth: 0,
          req,
          disableErrors: true,
        })
  Object.assign(
    data,
    submissionState(
      candidate,
      { status: (value('status') ?? 'new') as SubmissionStatus, saved },
      new Date(),
    ),
  )
  return data
}

// A suggested position goes into the review queue at once: its candidate links itself back
// (Candidates.ts), which sets this suggestion to "In the review queue". Other kinds stay here as
// New until their milestones give them candidates.
const queue: CollectionAfterChangeHook<Submission> = async ({ doc, operation, req }) => {
  const kind = CANDIDATE_KIND_OF[doc.kind]
  if (operation !== 'create' || !kind || idOf(doc.candidate) !== undefined) return doc
  await req.payload.create({
    collection: 'candidates',
    data: { kind, rawUrl: doc.url, submission: doc.id, status: 'new' },
    depth: 0,
    req,
  })
  const queued = await req.payload.findByID({
    collection: 'submissions',
    id: doc.id,
    select: { candidate: true, status: true, updatedAt: true },
    depth: 0,
    req,
  })
  return { ...doc, ...queued }
}

/** Given by the person who suggested it, and never changed by editors. */
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
  // Set by the hooks, and by the email task (src/jobs/maintenance/notifySubmitters.ts), only.
  access: { create: () => false, update: () => false },
  admin: {
    position: 'sidebar',
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
    description,
  },
})

/** Personal data: never a list column, and never loaded by the list. */
const PRIVATE_FIELDS = ['email', 'note'] as const

// PLAN §3.2, §5.1: suggestions from the public "Suggest a listing" form (M4.5). Nothing is
// published from here: a suggested position becomes a candidate in the review queue.
export const Submissions: CollectionConfig = {
  slug: 'submissions',
  labels: { singular: 'Suggestion', plural: 'Suggestions' },
  admin: {
    group: 'Review queue',
    useAsTitle: 'url',
    // Never a column for the email address or the note: they are personal data. The list loads
    // only its columns (Payload's select API, experimental in 3.90), and the keepOutOfLists hook
    // drops these fields from any column list, also one from ?columns= or a saved preference, so
    // they are not sent to the list page either; an editor sees them only by opening a suggestion.
    enableListViewSelectAPI: true,
    defaultColumns: ['url', 'kind', 'status', 'createdAt'],
    listSearchableFields: ['url'],
    description: `Suggestions from the "Suggest a listing" form, newest first. A suggested position goes straight into the review queue as a candidate: decide it there, and the suggestion follows. Events, funding, papers, news, resources and other suggestions are not in the review queue yet: they wait here as New until their milestones; check them by hand and set them to Decided. The email address is stored only with the person's consent, to email them the outcome once email is set up (M2): when the candidate is rejected or marked as a duplicate (with a plain reason, never your note), or once its job is published. The suggestion, with its email address, link and note, is deleted ${SUBMISSION_RETENTION_DAYS} days after the decision (D34). To answer a data request, filter by Email, then delete.`,
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-createdAt',
  access: {
    // Personal data: signed-in editors only.
    read: signedIn,
    // Created only by the form (M4.5), through the local API; never through the API or the admin.
    create: nobody,
    update: signedIn,
    // Signed-in editors, to answer data requests (PLAN §3.2, §18.1).
    delete: signedIn,
  },
  disableDuplicate: true,
  hooks: {
    beforeOperation: [keepOutOfLists(PRIVATE_FIELDS)],
    beforeValidate: [prepare],
    afterChange: [queue],
    // A deletion an editor or a data request makes must survive a restore (src/collections/
    // DeletionLog.ts); the retention task's deletions repeat themselves.
    afterDelete: [logDeletions('submissions')],
  },
  fields: [
    fromForm({
      name: 'url',
      label: 'Suggested address',
      type: 'text',
      required: true,
      maxLength: 2000,
      validate: (value: string | null | undefined, options: Options) =>
        (value ? addressProblem(value) : null) ?? validations.text(value, options as never),
    }),
    fromForm({
      name: 'kind',
      label: 'Content type',
      type: 'select',
      required: true,
      options: SUBMISSION_KINDS.map(({ value, label }) => ({ value, label })),
    }),
    fromForm({
      name: 'note',
      type: 'textarea',
      maxLength: 500,
      admin: {
        disableListColumn: true,
        description: `From the person who suggested it. Deleted ${SUBMISSION_RETENTION_DAYS} days after the decision.`,
      },
    }),
    {
      type: 'row',
      fields: [
        {
          name: 'email',
          type: 'email',
          validate: (value: string | null | undefined, options: Options) =>
            value && value.length > MAX_EMAIL_LENGTH
              ? 'This email address is too long.'
              : validations.email(value, options as never),
          access: { update: () => false },
          admin: {
            readOnly: true,
            disableListColumn: true,
            description: `Only to tell them the outcome, and only with their consent. Deleted ${SUBMISSION_RETENTION_DAYS} days after the decision.`,
          },
        },
        {
          name: 'consentToContact',
          label: 'Agreed to be told the outcome',
          type: 'checkbox',
          defaultValue: false,
          access: { update: () => false },
          admin: { readOnly: true },
        },
      ],
    },
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

    // Sidebar
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: SUBMISSION_STATUSES.map(({ value, label }) => ({ value, label })),
      // Editors set it only for suggestions without a candidate; the others follow the queue. It
      // checks the user itself: Payload's permission routes (/api/access/) run it for signed-out
      // requests too, which would otherwise learn which suggestions have a candidate.
      access: { update: ({ req, doc }) => Boolean(req.user) && idOf(doc?.candidate) === undefined },
      validate: (value: string | null | undefined, options: Options) =>
        value === 'queued' && idOf(options.data.candidate) === undefined
          ? 'Only a suggestion with a candidate is in the review queue. Set it to New or Decided.'
          : validations.select(value as never, options as never),
      admin: {
        position: 'sidebar',
        description:
          'A suggested position follows its candidate. Other kinds wait as New until their milestones; set them to Decided once handled by hand.',
      },
    },
    {
      name: 'candidate',
      type: 'relationship',
      relationTo: 'candidates',
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Its entry in the review queue.',
      },
    },
    sidebarDate(
      'decidedAt',
      'Decided',
      'When its candidate was decided, or it was set to Decided.',
    ),
    sidebarDate(
      'emailPurgeAt',
      'Personal data deleted on',
      `The suggestion, with the email address, link and note, is deleted ${SUBMISSION_RETENTION_DAYS} days after the decision by the nightly retention task (D34).`,
    ),
    sidebarDate(
      'notifiedAt',
      'Outcome emailed',
      'When the person was emailed the outcome. Empty while no mail server is set up, while the job is not published yet, and for spam.',
    ),
  ],
}
