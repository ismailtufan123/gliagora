import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  FieldAccess,
  Where,
} from 'payload'

import { signedIn } from '@/lib/access'
import {
  INTRO_MAX,
  PREHEADER_MAX,
  SELECTED_MAX,
  SUBJECT_MAX,
  readSnapshot,
} from '@/lib/newsletter/issue/content'
import { proposeSelectedJobs } from '@/lib/newsletter/issue/build'
import { ISSUE_ENDPOINTS } from '@/lib/newsletter/issue/endpoints'
import { ISSUE_STATUSES, LOCKED_STATUSES, type IssueStatus } from '@/lib/newsletter/issue/status'
import { issueMonth, nextIssueDate } from '@/lib/newsletter/issue/schedule'

// The issues of Glia Notes (M11, D53; PLAN §3.2 "Newsletter builder", §5.1 `NewsletterIssue`, §13):
// one a month, dated by default the next first Tuesday at 13:00 UTC (D16). An editor writes the
// subject, the preheader and the opening note and picks the selected positions (the builder
// proposes them); the deadlines come from the published jobs. The issue's actions (in the
// sidebar: src/admin/IssueActions.tsx, routes in src/lib/newsletter/issue/endpoints.ts) preview
// it, send a test to the editor and the seed addresses, and push it to listmonk as a campaign,
// as a draft or scheduled; nothing goes out without an editor's action, and pushing stays off
// until the launch (GLIA_NOTES_PUSH, D53). The archive pages (/en/newsletter/archive/ and
// /en/newsletter/{yyyy-mm}/) show sent issues from their snapshot. Issues hold no personal data.

type IssueData = {
  id: number
  sendAt?: string | null
  month?: string | null
  selected?: (number | { id: number })[] | null
  proposeAgain?: boolean | null
  status?: IssueStatus | null
}

/**
 * The editor's fields, locked while the campaign in listmonk is scheduled, sending, paused or sent:
 * listmonk would send another content than the issue shows. Pushing it as a draft again unlocks a
 * scheduled issue.
 */
const editable: FieldAccess<IssueData> = ({ req, doc }) =>
  Boolean(req.user) && !LOCKED_STATUSES.has((doc?.status ?? 'draft') as IssueStatus)

/** Set only by the site (the push and the campaigns' check), never by hand. */
const bySite = { create: () => false, update: () => false }

const setMonth: CollectionBeforeValidateHook<IssueData> = ({ data }) => {
  if (!data?.sendAt) return data
  const sendAt = new Date(data.sendAt)
  return Number.isNaN(sendAt.getTime()) ? data : { ...data, month: issueMonth(sendAt) }
}

/** The selection of the issue sent before this one's date, which a proposal leaves out. */
async function previousSelection(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  sendAt: Date,
  id?: number,
): Promise<number[]> {
  const where: Where = {
    and: [
      { sendAt: { less_than: sendAt.toISOString() } },
      { snapshot: { exists: true } },
      ...(id === undefined ? [] : [{ id: { not_equals: id } }]),
    ],
  }
  const { docs } = await req.payload.find({
    collection: 'newsletter-issues',
    where,
    sort: '-sendAt',
    limit: 1,
    depth: 0,
    select: { snapshot: true },
    req,
  })
  return readSnapshot(docs[0]?.snapshot)?.selected.map((job) => job.id) ?? []
}

/** On a new issue without positions, and whenever the editor asks: the builder's proposal. */
const propose: CollectionBeforeChangeHook<IssueData> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const { proposeAgain, ...rest } = data
  const empty = (rest.selected ?? []).length === 0
  if (!(proposeAgain || (operation === 'create' && empty)) || !rest.sendAt) return rest
  if (LOCKED_STATUSES.has((originalDoc?.status ?? 'draft') as IssueStatus)) return rest
  const sendAt = new Date(rest.sendAt)
  const exclude = await previousSelection(req, sendAt, originalDoc?.id)
  return { ...rest, selected: await proposeSelectedJobs(req.payload, sendAt, new Date(), exclude) }
}

export const NewsletterIssues: CollectionConfig = {
  slug: 'newsletter-issues',
  labels: { singular: 'Glia Notes issue', plural: 'Glia Notes issues' },
  admin: {
    group: 'Glia Notes',
    useAsTitle: 'subject',
    defaultColumns: ['month', 'subject', 'status', 'sendAt'],
    description:
      'One issue a month, sent on the first Tuesday at 13:00 UTC (16:00 in Türkiye). Write the subject, the preheader and the opening note, check the selected positions, save, then preview, send a test and push it to listmonk (the sidebar). The editor guide (Yardım), section 8, has the steps.',
    pagination: { defaultLimit: 25 },
  },
  defaultSort: '-sendAt',
  // Signed-in editors. The archive pages read sent issues through the local API, from their
  // snapshot; signed out, the API gives nothing.
  access: {
    read: signedIn,
    create: signedIn,
    update: signedIn,
    // Only an issue that never reached listmonk: a pushed one is part of the record of what was sent.
    delete: ({ req }) => (req.user ? { listmonkCampaignId: { exists: false } } : false),
  },
  // A copy would repeat the month, which is unique.
  disableDuplicate: true,
  hooks: {
    beforeValidate: [setMonth],
    beforeChange: [propose],
  },
  endpoints: ISSUE_ENDPOINTS,
  fields: [
    {
      name: 'sendAt',
      label: 'Date and time',
      type: 'date',
      required: true,
      index: true,
      access: { update: editable },
      defaultValue: () => nextIssueDate(new Date()).toISOString(),
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
          timeIntervals: 15,
          displayFormat: 'd MMM yyyy, HH:mm',
        },
        description:
          "Shown in your computer's time zone. By default the next first Tuesday at 13:00 UTC, which is 16:00 in Türkiye (D16). The launch issue goes out on launch day (D41).",
      },
    },
    {
      name: 'month',
      type: 'text',
      unique: true,
      index: true,
      // From the date (beforeValidate): the issue's archive address, /en/newsletter/{month}/.
      access: bySite,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description:
          'From the date: one issue a month. Its archive address is /en/newsletter/{month}/.',
      },
    },
    {
      name: 'subject',
      type: 'text',
      required: true,
      maxLength: SUBJECT_MAX,
      access: { update: editable },
      admin: {
        description:
          'The email’s subject, e.g. “Glia Notes, November 2026: 14 deadlines in neuroscience”. Under about 60 characters reads best on phones.',
      },
    },
    {
      name: 'preheader',
      type: 'text',
      maxLength: PREHEADER_MAX,
      access: { update: editable },
      admin: {
        description:
          'The line mail programs show after the subject in the inbox, e.g. “Selected positions in Europe, Asia and the Americas”. About 40–100 characters.',
      },
    },
    {
      name: 'intro',
      label: 'Opening note',
      type: 'textarea',
      required: true,
      maxLength: INTRO_MAX,
      access: { update: editable },
      admin: {
        description:
          'Two or three sentences in your words, at the top of the issue (PLAN §13). Separate paragraphs with a blank line.',
      },
    },
    {
      name: 'selected',
      label: 'Selected positions',
      type: 'relationship',
      relationTo: 'jobs',
      hasMany: true,
      maxRows: SELECTED_MAX,
      access: { update: editable },
      // The picker offers published jobs only. Payload's own check of a relationship would also
      // apply that on every save, so an issue whose selected job has since closed (the hourly
      // expiry) could no longer be saved, even by the site's own updates of its status: the check
      // is only the number of positions, and the builder leaves out any that are no longer open.
      filterOptions: { status: { equals: 'published' } },
      validate: (value: unknown) =>
        !Array.isArray(value) ||
        value.length <= SELECTED_MAX ||
        `Choose at most ${SELECTED_MAX} positions.`,
      admin: {
        isSortable: true,
        description:
          'Ten to fifteen open positions, balanced by subfield and region (PLAN §13). The builder proposes twelve when the issue is created; reorder (drag), remove or add them. A position that has closed by the time the issue is pushed is left out.',
      },
    },
    {
      name: 'proposeAgain',
      label: 'Propose the selected positions again when I save',
      type: 'checkbox',
      // Not stored: read once by the beforeChange hook.
      virtual: true,
      access: { update: editable },
      admin: {
        description:
          'Replaces the selected positions with a new proposal: the newest open positions, one region after another, each with a subfield not chosen yet, leaving out the previous issue’s.',
      },
    },
    {
      name: 'actions',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/admin/IssueActions#IssueActions' },
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ISSUE_STATUSES.map(({ value, label }) => ({ value, label })),
      access: bySite,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description:
          'Set by the site: by a push to listmonk, and by its check of the campaign every 10 minutes.',
      },
    },
    {
      name: 'listmonkCampaignId',
      label: 'Campaign in listmonk',
      type: 'number',
      index: true,
      access: bySite,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'pushedAt',
      label: 'Last pushed to listmonk',
      type: 'date',
      access: bySite,
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      },
    },
    {
      name: 'sentAt',
      label: 'Sent',
      type: 'date',
      index: true,
      access: bySite,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'When listmonk started sending it, as listmonk reports it.',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      },
    },
    {
      // The content as it was pushed: what listmonk sends and the archive shows
      // (src/lib/newsletter/issue/content.ts).
      name: 'snapshot',
      type: 'json',
      access: bySite,
      admin: { hidden: true },
    },
  ],
}
