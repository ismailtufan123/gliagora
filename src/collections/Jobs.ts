import type {
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
  PayloadRequest,
  RequestContext,
  Where,
} from 'payload'
import { APIError, validations } from 'payload'

import { fixedFieldHooks } from '@/lib/fixed-fields'
import {
  DEADLINE_KINDS,
  type DeadlineKind,
  addDays,
  calendarDay,
  deadlineEnd,
  storedDay,
} from '@/lib/jobs/deadline'
import { ORIGINAL_LANGUAGES } from '@/lib/jobs/languages'
import { type DedupeFacts, duplicateReason, normaliseTitle } from '@/lib/jobs/similarity'
import {
  JOB_STATUSES,
  type JobStatus,
  type StatusTimes,
  needsFacts,
  statusProblem,
  statusTimes,
} from '@/lib/jobs/status'
import { TIME_ZONES, isTimeZone, timeZoneLabel } from '@/lib/jobs/time-zones'
import { addressProblem, canonicalUrl } from '@/lib/jobs/url'
import { idOf } from '@/lib/relationship'
import { SHORT_ID_PATTERN, newShortId } from '@/lib/short-id'
import { slugify } from '@/lib/slug'
import type { Vocabulary } from '@/lib/taxonomy'
import type { Job } from '@/payload-types'

type JobData = Partial<Job>

/** What Payload passes to a field's validate function, as far as these rules use it. */
type Options = {
  data: JobData
  event?: 'onChange' | 'submit'
  id?: number | string
  previousValue?: unknown
  req: PayloadRequest
}

/**
 * Lets `pnpm fake:jobs` (src/scripts/fake-jobs.ts) back-date the status timestamps of the fake
 * jobs it creates and remove them again, although they were published. The value is a symbol,
 * which no request can supply, and it is ignored on the production server.
 */
export const FAKE_DATA = Symbol.for('gliagora.fake-jobs')

export const isFakeData = (context: RequestContext | undefined) =>
  context?.fakeData === FAKE_DATA && process.env.PAYLOAD_JOBS_AUTORUN !== 'true'

const termIds = (value: unknown): number[] =>
  (Array.isArray(value) ? value : value == null ? [] : [value])
    .map((item) => Number(idOf(item)))
    .filter((id) => !Number.isNaN(id))

/**
 * Where a job is shown on the map and in filters: the location override when it has one (a site
 * away from the institution), otherwise the institution's city and country.
 */
export function jobLocation(
  override: { city?: string | null; country?: unknown } | null | undefined,
  institution: { city?: string | null; country?: unknown } | null | undefined,
): { country: string | null; city: string | null } {
  const overrideCountry = idOf(override?.country)
  const institutionCountry = idOf(institution?.country)
  const country = String(overrideCountry ?? institutionCountry ?? '') || null
  const overrideCity = override?.city?.trim() || null
  // An override to another country without a city leaves the city open.
  const city =
    overrideCity ??
    (overrideCountry !== undefined && overrideCountry !== institutionCountry
      ? null
      : (institution?.city ?? null))
  return { country, city }
}

async function uniqueShortId(req: PayloadRequest): Promise<string> {
  // 32⁵ IDs make a clash very unlikely; checking avoids a confusing "must be unique" error.
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortId = newShortId()
    const { totalDocs } = await req.payload.count({
      collection: 'jobs',
      where: { shortId: { equals: shortId } },
      req,
    })
    if (totalDocs === 0) return shortId
  }
  throw new APIError('No free short ID was found. Save again.')
}

// Fills in everything editors do not type: short ID, slug, the shown location, the canonical
// address and title fingerprint for the duplicate check, the deadline as a calendar day and the
// instant it ends, and the status timestamps. Runs for every save, including code that bypasses
// access control and restoring a version, so the computed values always match the facts.
const prepare: CollectionBeforeValidateHook<Job> = async ({
  data,
  originalDoc,
  operation,
  context,
  req,
}) => {
  if (!data) return data
  const saved: JobData = originalDoc ?? {}
  const value = <K extends keyof Job>(key: K): Job[K] | undefined =>
    key in data ? (data as Job)[key] : saved[key]

  if (typeof data.title === 'string') data.title = data.title.trim()
  const title = value('title')
  if (title) {
    data.slug = slugify(title, { fallback: 'job' })
    data.fingerprint = normaliseTitle(title)
  }
  if (operation === 'create' && !data.shortId) data.shortId = await uniqueShortId(req)

  if (typeof data.originalUrl === 'string') data.originalUrl = data.originalUrl.trim() || null
  const originalUrl = value('originalUrl')
  data.canonicalUrl = originalUrl ? canonicalUrl(originalUrl) : null

  if ((value('deadlineKind') ?? 'fixed') === 'fixed') {
    const day = calendarDay(value('deadlineDate'))
    if (day) data.deadlineDate = storedDay(day)
    const timeZone = value('deadlineTz') || null
    data.deadlineTz = timeZone
    data.deadlineAt =
      day && (timeZone === null || isTimeZone(timeZone))
        ? deadlineEnd(day, timeZone).toISOString()
        : null
  } else {
    data.deadlineDate = null
    data.deadlineTz = null
    data.deadlineAt = null
  }
  const verified = calendarDay(value('verifiedAt'))
  if (verified) data.verifiedAt = storedDay(verified)

  const override = value('locationOverride')
  const institutionId = idOf(value('institution'))
  const institution =
    institutionId === undefined || (override?.city && override.country)
      ? null
      : await req.payload.findByID({
          collection: 'institutions',
          id: institutionId,
          select: { city: true, country: true },
          depth: 0,
          req,
          disableErrors: true,
        })
  Object.assign(data, jobLocation(override, institution))

  const status = (value('status') ?? 'draft') as JobStatus
  // Closing a job clears the two checks that describe the open position, so publishing it again
  // needs them ticked again after a new look at the employer's page (PLAN §6.3, §6.4).
  if (
    operation === 'update' &&
    saved.status === 'published' &&
    (status === 'expired' || status === 'withdrawn')
  ) {
    data.checks = { ...(value('checks') ?? {}), positionOpen: false, deadlineConfirmed: false }
  }
  const times = statusTimes(operation === 'update' ? saved : undefined, status, new Date())
  if (isFakeData(context)) {
    for (const key of Object.keys(times) as (keyof StatusTimes)[]) {
      if (data[key]) times[key] = data[key]
    }
  }
  Object.assign(data, times)
  return data
}

// Published addresses keep answering, first with the closed notice and then with 410 Gone (PLAN
// §2.5), so only drafts that were never published are deleted. Access control shows this in the
// admin; this hook also covers code that bypasses it.
const keepPublished: CollectionBeforeDeleteHook = async ({ id, req, context }) => {
  if (isFakeData(context)) return
  const job = await req.payload.findByID({
    collection: 'jobs',
    id,
    select: { status: true, publishedAt: true },
    depth: 0,
    req,
    disableErrors: true,
  })
  if (!job) return
  if (job.publishedAt) {
    throw new APIError(
      'A job that has been published is never deleted, because its address must keep answering. Set its status to Withdrawn instead.',
      403,
      null,
      true,
    )
  }
  if (job.status !== 'draft') {
    throw new APIError(
      'Only drafts can be deleted. Set the status back to Draft first.',
      403,
      null,
      true,
    )
  }
  // The review queue points at this draft: the candidate it was made from ("Job created", and
  // accepted is final) or candidates marked as its duplicates. Deleting it would leave those
  // decisions without their job, and nothing could repair them (PLAN §5.1, §6.3).
  const { totalDocs } = await req.payload.count({
    collection: 'candidates',
    where: { or: [{ publishedRef: { equals: id } }, { duplicateOf: { equals: id } }] },
    req,
  })
  if (totalDocs > 0) {
    throw new APIError(
      'This draft is linked from the review queue (made from an accepted candidate, or the job a candidate repeats), so it is kept. Edit it instead.',
      403,
      null,
      true,
    )
  }
}

// ---------------------------------------------------------------------------------------------
// Rules checked when a job is saved (PLAN §6.4). Each one is a field validation, so the admin
// shows every missing item at once, next to its field.

const facts = (data: JobData) => needsFacts(data.status)

/** Terms of one vocabulary. Inactive terms stay on the jobs that have them but cannot be added. */
function termField({
  name,
  label,
  vocabulary,
  hasMany,
  needed,
  description,
}: {
  name: 'positionType' | 'careerStages' | 'subfields' | 'methods' | 'modelSystems'
  label: string
  vocabulary: Vocabulary
  hasMany: boolean
  /** The message when a job in review or published has none. */
  needed?: string
  description?: string
}): Field {
  return {
    name,
    label,
    type: 'relationship',
    relationTo: 'terms',
    hasMany,
    // The picker offers active terms, and keeps showing inactive ones the job already has.
    filterOptions: ({ data }) => {
      const current = termIds((data as JobData | undefined)?.[name])
      const shown: Where[] = [{ isActive: { equals: true } }]
      if (current.length > 0) shown.push({ id: { in: current } })
      const where: Where = { and: [{ vocabulary: { equals: vocabulary } }, { or: shown }] }
      return where
    },
    validate: async (value: unknown, { data, event, previousValue, req }: Options) => {
      const ids = termIds(value)
      if (needed && facts(data) && ids.length === 0) return needed
      // The database is checked when saving, not while the form is being edited.
      if (ids.length === 0 || event === 'onChange') return true
      const { docs } = await req.payload.find({
        collection: 'terms',
        where: { id: { in: ids } },
        select: { vocabulary: true, isActive: true, label: true },
        depth: 0,
        limit: ids.length,
        pagination: false,
        req,
      })
      const terms = new Map(docs.map((term) => [term.id, term]))
      if (ids.some((id) => terms.get(id)?.vocabulary !== vocabulary)) {
        return `Choose ${label.toLowerCase()} from the list.`
      }
      const before = new Set(termIds(previousValue))
      const retired = ids.filter((id) => !before.has(id) && terms.get(id)?.isActive === false)
      if (retired.length > 0) {
        const names = retired.map((id) => `"${terms.get(id)?.label}"`).join(', ')
        return `${names} ${retired.length === 1 ? 'is' : 'are'} no longer in use. Choose another term.`
      }
      return true
    },
    admin: { description },
  }
}

const checklistBox = (name: string, label: string): Field => ({
  name,
  label,
  type: 'checkbox',
  defaultValue: false,
  validate: (value: boolean | null | undefined, { data }: Options) =>
    data.status !== 'published' || value === true || 'Check this before publishing.',
})

/** One entry of the duplicate warning. */
type Match = {
  shortId?: string | null
  title?: string | null
  reason: 'same-address' | 'similar-title'
}

/** What the duplicate check compares, from a job's data. */
export function dedupeFacts(job: JobData): DedupeFacts {
  const title = job.title?.trim()
  const originalUrl = job.originalUrl?.trim()
  const kind = (job.deadlineKind ?? 'fixed') as DeadlineKind
  return {
    canonicalUrl: originalUrl ? canonicalUrl(originalUrl) : null,
    institution: idOf(job.institution) ?? null,
    deadlineKind: kind,
    deadlineDay: kind === 'fixed' ? calendarDay(job.deadlineDate) : null,
    fingerprint: title ? normaliseTitle(title) : null,
  }
}

const sameFacts = (a: DedupeFacts, b: DedupeFacts) =>
  (Object.keys(a) as (keyof DedupeFacts)[]).every(
    (key) => String(a[key] ?? '') === String(b[key] ?? ''),
  )

/**
 * Other jobs that are probably the same position (PLAN §6.3). Left out: withdrawn jobs and jobs
 * already marked as a duplicate. Two indexed lookups narrow the candidates (the same canonical
 * address, or the same institution and deadline); the titles are then compared here.
 */
export async function findDuplicates(
  req: PayloadRequest,
  job: DedupeFacts & { id?: number | string },
): Promise<Match[]> {
  const candidates: Where[] = []
  if (job.canonicalUrl) candidates.push({ canonicalUrl: { equals: job.canonicalUrl } })
  if (job.institution != null && job.deadlineKind === 'fixed' && job.deadlineDay) {
    candidates.push({
      institution: { equals: job.institution },
      deadlineDate: {
        greater_than_equal: `${job.deadlineDay}T00:00:00.000Z`,
        less_than: `${addDays(job.deadlineDay, 1)}T00:00:00.000Z`,
      },
    })
  } else if (job.institution != null && job.deadlineKind && job.deadlineKind !== 'fixed') {
    candidates.push({
      institution: { equals: job.institution },
      deadlineKind: { equals: job.deadlineKind },
    })
  }
  if (candidates.length === 0) return []
  const { docs } = await req.payload.find({
    collection: 'jobs',
    where: {
      and: [
        { status: { not_equals: 'withdrawn' } },
        { duplicateOf: { exists: false } },
        { or: candidates },
        ...(job.id == null ? [] : [{ id: { not_equals: job.id } }]),
      ],
    },
    select: {
      shortId: true,
      title: true,
      canonicalUrl: true,
      institution: true,
      deadlineKind: true,
      deadlineDate: true,
      fingerprint: true,
    },
    depth: 0,
    // An institution rarely has more than a handful of positions with the same deadline.
    limit: 200,
    pagination: false,
    req,
  })
  return docs.flatMap((doc) => {
    const reason = duplicateReason(job, {
      canonicalUrl: doc.canonicalUrl,
      institution: idOf(doc.institution),
      deadlineKind: doc.deadlineKind,
      deadlineDay: calendarDay(doc.deadlineDate),
      fingerprint: doc.fingerprint,
    })
    return reason ? [{ shortId: doc.shortId, title: doc.title, reason }] : []
  })
}

/** The warning shown on "Not a duplicate", naming the matches and how to go on. */
export function duplicateMessage(matches: Match[]): string {
  const named = matches
    .slice(0, 5)
    .map(
      ({ shortId, title, reason }) =>
        `${shortId} "${title}" (${reason === 'same-address' ? 'same address' : 'similar title, same institution and deadline'})`,
    )
  const more = matches.length > 5 ? ` and ${matches.length - 5} more` : ''
  return `This may be the same position as ${named.join('; ')}${more}. If it is a different position, tick "Not a duplicate". If it is the same, choose that job under "Duplicate of" and do not publish this one.`
}

// Runs when a job goes to review or publication, when a job in review or published gets another
// title, address, institution or deadline, and when its "Duplicate of" is cleared; other saves of
// it are not checked again. "Not a duplicate" is not stored, so a tick applies only to the save
// it was given with: the facts it approved are the saved ones, and changing them checks again.
const validateDuplicates = async (
  value: boolean | null | undefined,
  { data, event, id, req }: Options,
) => {
  if (!facts(data) || value === true || data.duplicateOf != null || event === 'onChange') {
    return true
  }
  const job = dedupeFacts(data)
  if (id != null) {
    // Validation runs before the save, so this is the job as it was.
    const saved = await req.payload.findByID({
      collection: 'jobs',
      id,
      select: {
        status: true,
        title: true,
        originalUrl: true,
        institution: true,
        deadlineKind: true,
        deadlineDate: true,
        duplicateOf: true,
      },
      depth: 0,
      req,
      disableErrors: true,
    })
    // A saved job marked as a duplicate skipped the check, so it has not passed it.
    const checked = saved && needsFacts(saved.status) && idOf(saved.duplicateOf) === undefined
    if (checked && sameFacts(dedupeFacts(saved), job)) return true
  }
  const matches = await findDuplicates(req, { ...job, id })
  return matches.length === 0 || duplicateMessage(matches)
}

const validateDeadlineDate = (value: unknown, options: Options) => {
  const { data } = options
  const day = calendarDay(value as string | null | undefined)
  if (facts(data) && !day) return 'Enter the deadline, or choose Rolling or Until filled.'
  if (day && data.status === 'published') {
    const timeZone = data.deadlineTz || null
    if ((timeZone === null || isTimeZone(timeZone)) && deadlineEnd(day, timeZone) <= new Date()) {
      return 'This deadline has passed. Set the status to Expired, or correct the deadline.'
    }
  }
  return validations.date(value as Date, options as never)
}

/** A fixed deadline's day and time zone, or the kind of an open-ended one. */
const deadlineKey = (job: JobData) => {
  const kind = job.deadlineKind ?? 'fixed'
  return kind === 'fixed'
    ? `fixed|${calendarDay(job.deadlineDate) ?? ''}|${job.deadlineTz || ''}`
    : kind
}

// PLAN §6.3: a deadline is published only after it was seen on the original page, and the day it
// was seen is "Last verified". So publishing a closed job again, or changing the deadline of a
// published one, needs a later day than the saved one, or today.
const validateVerifiedAt = async (value: unknown, options: Options) => {
  const { data, event, id, req } = options
  const day = calendarDay(value as string | null | undefined)
  if (facts(data) && !day) {
    return "Enter the day you checked the facts on the employer's page."
  }
  // Allow today anywhere on Earth (up to UTC+14).
  const latest = calendarDay(new Date(Date.now() + 14 * 3_600_000))
  if (day && latest && day > latest) return 'This day is in the future.'
  if (day && data.status === 'published' && id != null && event !== 'onChange') {
    // Validation runs before the save, so this is the job as it was.
    const saved = await req.payload.findByID({
      collection: 'jobs',
      id,
      select: {
        status: true,
        deadlineKind: true,
        deadlineDate: true,
        deadlineTz: true,
        verifiedAt: true,
      },
      depth: 0,
      req,
      disableErrors: true,
    })
    const reopened = saved?.status === 'expired' || saved?.status === 'withdrawn'
    const moved = saved?.status === 'published' && deadlineKey(saved) !== deadlineKey(data)
    const savedDay = calendarDay(saved?.verifiedAt)
    // The earliest day that is today somewhere on Earth (UTC−12).
    const today = calendarDay(new Date(Date.now() - 12 * 3_600_000))
    if ((reopened || moved) && savedDay && day <= savedDay && !(today && day >= today)) {
      return reopened
        ? "Check the position on the employer's page again before publishing it again, and set Last verified to that day."
        : "The deadline changed: set Last verified to the day you saw the new deadline on the employer's page."
    }
  }
  return validations.date(value as Date, options as never)
}

const NEVER_PUBLISHED_DRAFT: Where = {
  and: [{ status: { equals: 'draft' } }, { publishedAt: { exists: false } }],
}

// The short ID ends the job's address, so it never changes, also when a version is restored. The
// suggestion a job came from is set when its candidate is accepted (src/collections/Candidates.ts)
// and stays with it.
const fixedFields = fixedFieldHooks('jobs', ['shortId', 'submission'])

// PLAN §5.1, §6: a position at an employer, published as facts, our own summary and a link to the
// employer's own page. Editors save drafts freely; review and publication need the facts, and
// publication the editorial checklist too. A published job is never deleted.
export const Jobs: CollectionConfig = {
  slug: 'jobs',
  labels: { singular: 'Job', plural: 'Jobs' },
  admin: {
    group: 'Listings',
    useAsTitle: 'title',
    defaultColumns: ['title', 'institution', 'status', 'deadlineDate', 'updatedAt'],
    listSearchableFields: ['title', 'shortId'],
    description:
      "Positions from employers' own pages (PLAN §6). Save a draft at any time; to publish, fill in the facts and tick the checklist. Published jobs are never deleted: set them to Expired or Withdrawn. Every change is kept under Versions.",
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-updatedAt',
  access: {
    // Signed-in editors, and only drafts that were never published (keepPublished covers code
    // that bypasses this). A function replaces Payload's default, so it checks the user itself.
    delete: ({ req }) => (req.user ? NEVER_PUBLISHED_DRAFT : false),
  },
  // A copy would repeat the short ID, and a copied posting is the duplicate the checks look for.
  disableDuplicate: true,
  // Every change and every status transition is kept (PLAN §5.2).
  versions: { maxPerDoc: 100 },
  hooks: {
    beforeValidate: [...fixedFields.beforeValidate, prepare],
    beforeChange: fixedFields.beforeChange,
    beforeDelete: [keepPublished],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 300,
      admin: { description: 'The title exactly as the employer posted it, in its language.' },
    },
    {
      name: 'institution',
      type: 'relationship',
      relationTo: 'institutions',
      required: true,
      admin: { description: 'The employer. Search by name or ROR ID.' },
    },
    {
      name: 'locationOverride',
      label: 'Location, if not at the institution',
      type: 'group',
      admin: {
        description:
          'Only for a position at another site, such as a field station or a partner campus. Leave empty otherwise.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'city', type: 'text' },
            { name: 'country', type: 'relationship', relationTo: 'countries' },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        termField({
          name: 'positionType',
          label: 'Position type',
          vocabulary: 'position-type',
          hasMany: false,
          needed: 'Choose the position type.',
        }),
        termField({
          name: 'careerStages',
          label: 'Career stages',
          vocabulary: 'career-stage',
          hasMany: true,
        }),
      ],
    },
    termField({
      name: 'subfields',
      label: 'Subfields',
      vocabulary: 'subfield',
      hasMany: true,
      needed: 'Choose at least one subfield.',
    }),
    {
      type: 'row',
      fields: [
        termField({ name: 'methods', label: 'Methods', vocabulary: 'method', hasMany: true }),
        termField({
          name: 'modelSystems',
          label: 'Model systems',
          vocabulary: 'model-system',
          hasMany: true,
        }),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'deadlineKind',
          label: 'Deadline',
          type: 'select',
          required: true,
          defaultValue: 'fixed',
          options: DEADLINE_KINDS.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'deadlineDate',
          label: 'Deadline day',
          type: 'date',
          validate: validateDeadlineDate,
          admin: {
            condition: (data) => (data?.deadlineKind ?? 'fixed') === 'fixed',
            date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
            description: 'The last day to apply.',
          },
        },
        {
          name: 'deadlineTz',
          label: 'Time zone of the deadline',
          type: 'select',
          options: TIME_ZONES.map((zone) => ({ value: zone, label: timeZoneLabel(zone) })),
          admin: {
            condition: (data) => (data?.deadlineKind ?? 'fixed') === 'fixed',
            description:
              "The institution's time zone, or the one the posting names if it names another. Leave empty only if it is unknown: the day then ends Anywhere on Earth (UTC−12).",
          },
        },
      ],
    },
    {
      name: 'startText',
      label: 'Start',
      type: 'text',
      maxLength: 100,
      admin: {
        description: 'As stated in the posting, e.g. "January 2027" or "as soon as possible".',
      },
    },
    {
      name: 'summary',
      type: 'textarea',
      maxLength: 280,
      validate: (value: string | null | undefined, options: Options) =>
        facts(options.data) && !value?.trim()
          ? 'Write one or two sentences in your own words.'
          : validations.textarea(value, options as never),
      admin: {
        description:
          'One or two sentences in English, in your own words (at most 280 characters). Never copy sentences from the posting.',
      },
    },
    {
      name: 'originalUrl',
      label: 'Original posting',
      type: 'text',
      maxLength: 2000,
      validate: (value: string | null | undefined, options: Options) => {
        if (!value)
          return (
            !facts(options.data) || "Add the address of the posting on the employer's own website."
          )
        // Payload's own text check applies maxLength.
        return addressProblem(value) ?? validations.text(value, options as never)
      },
      admin: {
        description:
          "The posting on the employer's own website, never a job board (PLAN §6.1). Readers are sent there to apply.",
      },
    },
    {
      name: 'originalLanguage',
      label: 'Original language',
      type: 'select',
      required: true,
      defaultValue: 'en',
      options: ORIGINAL_LANGUAGES.map(({ value, label }) => ({ value, label })),
    },
    {
      name: 'checks',
      label: 'Editorial checklist',
      type: 'group',
      admin: {
        description:
          'Tick each box after checking it on the original page (PLAN §6.4). All are needed to publish.',
      },
      fields: [
        checklistBox(
          'employerOrigin',
          'Posted by the employer itself and not by a recruitment agency',
        ),
        checklistBox(
          'positionOpen',
          'The original page is reachable and the position is still open',
        ),
        checklistBox('deadlineConfirmed', 'The deadline is confirmed on the original page'),
        checklistBox('ownWords', 'The summary is in my own words with no copied sentences'),
        checklistBox(
          'noPersonalContacts',
          'No personal contact details and no logos or images are copied',
        ),
      ],
    },
    {
      name: 'internalNotes',
      label: 'Internal notes',
      type: 'textarea',
      admin: { description: 'For editors only; never shown on the site.' },
    },
    {
      type: 'collapsible',
      label: 'Duplicate check',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'canonicalUrl',
          label: 'Canonical address',
          type: 'text',
          index: true,
          admin: {
            readOnly: true,
            description:
              'The original address as https, without tracking parameters and fragments, for finding the same posting twice.',
          },
        },
        {
          name: 'fingerprint',
          label: 'Title fingerprint',
          type: 'text',
          admin: {
            readOnly: true,
            description:
              'The title in lower case without accents or punctuation, for comparing titles.',
          },
        },
      ],
    },

    // Sidebar
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: JOB_STATUSES.map(({ value, label }) => ({ value, label })),
      validate: (value: string | null | undefined, options: Options) =>
        statusProblem((value ?? 'draft') as JobStatus, Boolean(options.data.publishedAt)) ??
        validations.select(value, options as never),
      admin: {
        position: 'sidebar',
        description:
          'Review and publishing need the facts; publishing also needs the checklist. Withdrawn: the address answers "410 Gone" at once.',
      },
    },
    {
      name: 'verifiedAt',
      label: 'Last verified',
      type: 'date',
      validate: validateVerifiedAt,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMM yyyy' },
        description:
          "The day you last checked the facts on the employer's page. Shown on the site.",
      },
    },
    {
      name: 'shortId',
      label: 'Short ID',
      type: 'text',
      unique: true,
      index: true,
      access: { update: () => false },
      validate: (value: string | null | undefined) =>
        value == null || SHORT_ID_PATTERN.test(value) || 'A short ID has 5 letters and digits.',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Ends the address of the job and never changes.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Made from the title. When the title changes, the old address redirects.',
      },
    },
    {
      name: 'country',
      type: 'relationship',
      relationTo: 'countries',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: "From the location above, or else the institution's.",
      },
    },
    {
      name: 'city',
      type: 'text',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'deadlineAt',
      label: 'Closes at',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
        description: 'When the deadline day ends in its time zone, shown in your time zone.',
      },
    },
    {
      name: 'duplicateOf',
      label: 'Duplicate of',
      type: 'relationship',
      relationTo: 'jobs',
      filterOptions: ({ id }) => (id == null ? true : { id: { not_equals: id } }),
      validate: (value: unknown, options: Options) => {
        const other = idOf(value)
        if (other === undefined) return true
        if (options.id != null && String(other) === String(options.id)) {
          return 'A job cannot be a duplicate of itself.'
        }
        if (options.data.status === 'published') {
          return 'A job marked as a duplicate cannot be published. Clear this field if it is a different position.'
        }
        return validations.relationship(value as never, options as never)
      },
      admin: {
        position: 'sidebar',
        description: 'The job this one repeats. A duplicate is not published.',
      },
    },
    {
      name: 'confirmNotDuplicate',
      label: 'Not a duplicate',
      type: 'checkbox',
      // Not stored: a tick answers the warning of one save (validateDuplicates).
      virtual: true,
      defaultValue: false,
      validate: validateDuplicates,
      admin: {
        position: 'sidebar',
        // Virtual fields are read-only unless this says otherwise.
        readOnly: false,
        description:
          'Tick when the warning names a different position. Applies to this save; the check runs again when the title, address, institution or deadline change.',
      },
    },
    {
      name: 'publishedAt',
      label: 'First published',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      },
    },
    {
      name: 'expiredAt',
      label: 'Expired',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      },
    },
    {
      name: 'withdrawnAt',
      label: 'Withdrawn',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      },
    },
    {
      name: 'linkStatus',
      label: 'Link status',
      type: 'select',
      required: true,
      defaultValue: 'unchecked',
      options: [
        { value: 'unchecked', label: 'Not checked yet' },
        { value: 'ok', label: 'OK' },
        { value: 'redirect', label: 'Redirects' },
        { value: 'broken', label: 'Broken' },
        { value: 'gone', label: 'Gone' },
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Set by the weekly link check (M7).',
      },
    },
    {
      name: 'lastCheckedAt',
      label: 'Link last checked',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
      },
    },
    {
      name: 'submission',
      label: 'From suggestion',
      type: 'relationship',
      relationTo: 'submissions',
      // Set only when a candidate from a suggestion is accepted (src/collections/Candidates.ts).
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'The "Suggest a listing" suggestion this job came from, if any.',
      },
    },
    {
      name: 'aiAssisted',
      label: 'Drafted with AI assistance',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Tick if the summary or tags started from an AI draft (PLAN §6.6).',
      },
    },
  ],
}
