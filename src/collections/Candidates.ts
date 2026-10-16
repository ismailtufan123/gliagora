import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
  PayloadRequest,
  Where,
} from 'payload'
import { APIError, validations } from 'payload'

import { nobody, signedIn } from '@/lib/access'
import { storedDraft } from '@/lib/ai/draft'
import { calendarDay, storedDay } from '@/lib/jobs/deadline'
import { DUPLICATE_SIMILARITY, normaliseTitle, similarity } from '@/lib/jobs/similarity'
import type { JobStatus } from '@/lib/jobs/status'
import { addressProblem, canonicalUrl } from '@/lib/jobs/url'
import { redacted } from '@/lib/redaction/redact'
import { idOf } from '@/lib/relationship'
import {
  CANDIDATE_KINDS,
  CANDIDATE_STATUSES,
  type CandidateStatus,
  REJECTION_REASONS,
  decidedAt,
  isDecided,
  transitionProblem,
} from '@/lib/review/status'
import { storedFacts } from '@/lib/sources/facts'
import {
  type StoredTagSuggestions,
  type Taxonomy,
  loadTaxonomy,
  storedSuggestions,
  termKey,
} from '@/lib/tags/terms'
import type { Vocabulary } from '@/lib/taxonomy'
import type { Candidate, Job } from '@/payload-types'

import { isFakeData } from './Jobs'

type CandidateData = Partial<Candidate>

/** What Payload passes to a field's validate function, as far as these rules use it. */
type Options = {
  data: CandidateData
  event?: 'onChange' | 'submit'
  id?: number | string
  operation?: string
  previousValue?: unknown
  req: PayloadRequest
}

/**
 * Whether this save accepts the candidate. The facts accepting needs are checked on that save, not
 * on later saves of an accepted candidate: the retention task clears its address and title once
 * its job is retired (M4.7, D34). Called only when a fact is missing, so the saved status is read
 * from the database only then.
 */
async function accepting({ data, id, operation, req }: Options): Promise<boolean> {
  if (data.status !== 'accepted') return false
  if (operation !== 'update' || id == null) return true
  const saved = await req.payload.findByID({
    collection: 'candidates',
    id,
    select: { status: true },
    depth: 0,
    req,
    disableErrors: true,
  })
  return saved?.status !== 'accepted'
}

/**
 * Whether the retention task (M4.7, D34) cleared the posting's address and title of this saved
 * candidate: of a rejected or duplicate candidate with its suggestion, or once the job it was
 * accepted as or marked as a duplicate of was retired (the database then cleared that link).
 */
function linkCleared(saved: CandidateData): boolean {
  if (saved.rawUrl != null || saved.rawTitle != null) return false
  const suggestionGone = saved.fromSuggestion === true && saved.submission == null
  switch (saved.status) {
    case 'rejected':
      return suggestionGone
    case 'duplicate':
      return suggestionGone || saved.duplicateOf == null
    case 'accepted':
      return saved.publishedRef == null
    default:
      return false
  }
}

/** Jobs that a candidate can repeat by its title: those not closed yet. */
const NOT_CLOSED: JobStatus[] = ['draft', 'in_review', 'published']

/** What the duplicate check compares, from a candidate. */
export type CandidateFacts = {
  id?: number | string
  canonicalUrl?: string | null
  institution?: number | string | null
  fingerprint?: string | null
  /** The job made from the candidate, which repeats it by design. */
  publishedRef?: number | string | null
}

/**
 * Jobs and other candidates that are probably the same posting (PLAN §6.3). Jobs: the same
 * canonical address (any status, since accepting is refused then), or the same institution and
 * a title at least 0.8 similar among jobs not closed yet and not marked as a duplicate. The
 * deadline is not compared, because a candidate has none yet. Candidates: the same canonical
 * address, unless rejected. Two indexed lookups narrow the jobs; the titles are compared here.
 */
export async function findPossibleDuplicates(
  req: PayloadRequest,
  candidate: CandidateFacts,
): Promise<{ jobs: number[]; candidates: number[] }> {
  const address = candidate.canonicalUrl || null
  const jobQueries: Where[] = []
  if (address) jobQueries.push({ canonicalUrl: { equals: address } })
  if (candidate.institution != null && candidate.fingerprint) {
    jobQueries.push({
      institution: { equals: candidate.institution },
      status: { in: NOT_CLOSED },
      duplicateOf: { exists: false },
    })
  }
  const jobs =
    jobQueries.length === 0
      ? []
      : (
          await req.payload.find({
            collection: 'jobs',
            where: {
              and: [
                { or: jobQueries },
                ...(candidate.publishedRef == null
                  ? []
                  : [{ id: { not_equals: candidate.publishedRef } }]),
              ],
            },
            select: { canonicalUrl: true, fingerprint: true },
            sort: 'id',
            depth: 0,
            // An institution rarely has this many open positions at once.
            limit: 500,
            pagination: false,
            req,
          })
        ).docs.filter(
          (job) =>
            (address !== null && job.canonicalUrl === address) ||
            similarity(candidate.fingerprint ?? '', job.fingerprint ?? '') >= DUPLICATE_SIMILARITY,
        )
  const candidates = address
    ? (
        await req.payload.find({
          collection: 'candidates',
          where: {
            and: [
              { canonicalUrl: { equals: address } },
              { status: { not_equals: 'rejected' } },
              ...(candidate.id == null ? [] : [{ id: { not_equals: candidate.id } }]),
            ],
          },
          select: { status: true },
          sort: 'id',
          depth: 0,
          limit: 50,
          pagination: false,
          req,
        })
      ).docs
    : []
  return { jobs: jobs.map((job) => job.id), candidates: candidates.map((other) => other.id) }
}

// Fills in what editors do not type: the canonical address and title fingerprint, the decision
// time, the possible duplicates, and the links set by the hooks (kept as they are when an editor
// saves or a version is restored). A reason or a "Duplicate of" that no longer applies is cleared.
const prepare: CollectionBeforeValidateHook<Candidate> = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (!data) return data
  const saved: CandidateData = operation === 'update' ? (originalDoc ?? {}) : {}
  const value = <K extends keyof Candidate>(key: K): Candidate[K] | undefined =>
    key in data ? (data as Candidate)[key] : saved[key]

  // An admin form opened before the retention task cleared the address and title sends them back
  // on save, and no later run would clear them again: they stay cleared. Once the candidate is
  // reopened (saved as Triaged), an editor can type an address again.
  if (operation === 'update' && linkCleared(saved)) {
    data.rawUrl = null
    data.rawTitle = null
  }
  // Whether it came from a suggestion stays known after the suggestion is deleted by hand (a data
  // request), so that the retention task still clears the suggested link in time.
  data.fromSuggestion =
    operation === 'update' ? (saved.fromSuggestion ?? false) : idOf(data.submission) !== undefined

  if (typeof data.rawUrl === 'string') data.rawUrl = data.rawUrl.trim() || null
  if (typeof data.rawTitle === 'string') data.rawTitle = data.rawTitle.trim() || null
  // The source text is redacted before it is stored, whoever wrote it (PLAN §6.6, D52).
  if (typeof data.snippet === 'string') data.snippet = redacted(data.snippet)
  const rawUrl = value('rawUrl')
  data.canonicalUrl = rawUrl ? canonicalUrl(rawUrl) : null
  const rawTitle = value('rawTitle')
  data.fingerprint = rawTitle ? normaliseTitle(rawTitle) : null

  if (operation === 'update') {
    // The suggestion is linked when the candidate is made from it, and stays.
    data.submission = saved.submission ?? null
    // The job is linked by the accept hook below, through the local API. Once a job is linked it
    // stays, also when code restores a version from before the link.
    data.publishedRef = saved.publishedRef ?? data.publishedRef ?? null
  }

  const status = (value('status') ?? 'new') as CandidateStatus
  // Tags are suggested from the title and the source text while the candidate waits for a
  // decision, whenever either changes (src/lib/tags/, PLAN §6.3).
  const textChanged =
    operation === 'create' ||
    ('rawTitle' in data && data.rawTitle !== saved.rawTitle) ||
    ('snippet' in data && data.snippet !== saved.snippet)
  if (textChanged && !isDecided(status)) {
    const title = value('rawTitle') ?? ''
    const text = value('snippet') ?? ''
    data.tagSuggestions =
      title || text ? storedSuggestions({ title, text }, await loadTaxonomy(req.payload)) : null
  }
  if (status !== 'rejected') data.decisionReason = null
  if (status !== 'duplicate') data.duplicateOf = null
  data.decidedAt = decidedAt(saved, status, new Date())

  const found = await findPossibleDuplicates(req, {
    id: saved.id,
    canonicalUrl: data.canonicalUrl,
    institution: idOf(value('institution')),
    fingerprint: data.fingerprint,
    publishedRef: idOf(data.publishedRef ?? saved.publishedRef),
  })
  data.possibleDuplicates = found.jobs
  data.possibleDuplicateCandidates = found.candidates
  return data
}

/**
 * What a draft job starts with besides the candidate's address and title (M7): the AI draft, when
 * the candidate has one and the editor left "Start the job from the AI draft" ticked; the facts a
 * monitor read; the suggested tags. Each is a starting point the editor checks on the original
 * posting before publishing; the job's checklist asks for that.
 */
export function prefill(
  candidate: Candidate,
  taxonomy: Taxonomy | null,
): Partial<Job> & { notes: string[] } {
  const draft = candidate.useAiDraft === false ? null : storedDraft(candidate.aiSuggestion)
  const tags = (candidate.tagSuggestions ?? null) as StoredTagSuggestions | null
  const facts = storedFacts(candidate.extracted)
  const ids = (vocabulary: Vocabulary, slugs: readonly string[] | undefined) =>
    (slugs ?? []).flatMap((slug) => {
      const id = taxonomy?.byKey.get(termKey(vocabulary, slug))?.id
      return id === undefined ? [] : [id]
    })
  const result: Partial<Job> & { notes: string[] } = { notes: [] }

  const positionType = ids('position-type', [draft?.positionType ?? tags?.positionType?.slug ?? ''])
  if (positionType[0] !== undefined) result.positionType = positionType[0]
  const subfields = ids(
    'subfield',
    draft?.subfields.length ? draft.subfields : tags?.subfields.map((t) => t.slug),
  )
  if (subfields.length > 0) result.subfields = subfields
  const careerStages = ids(
    'career-stage',
    draft?.careerStages.length ? draft.careerStages : tags?.careerStages.map((t) => t.slug),
  )
  if (careerStages.length > 0) result.careerStages = careerStages
  const methods = ids(
    'method',
    tags?.methods.map((t) => t.slug),
  )
  if (methods.length > 0) result.methods = methods
  const modelSystems = ids(
    'model-system',
    tags?.modelSystems.map((t) => t.slug),
  )
  if (modelSystems.length > 0) result.modelSystems = modelSystems

  if (draft?.deadline) {
    result.deadlineKind = draft.deadline.kind as Job['deadlineKind']
    if (draft.deadline.date) result.deadlineDate = storedDay(draft.deadline.date)
    if (draft.deadline.timeZone) result.deadlineTz = draft.deadline.timeZone as Job['deadlineTz']
  } else if (facts?.deadline) {
    result.deadlineKind = 'fixed'
    result.deadlineDate = storedDay(facts.deadline.value.date)
    if (facts.deadline.value.timeZone) {
      result.deadlineTz = facts.deadline.value.timeZone as Job['deadlineTz']
    }
  } else if (facts?.openEnded) {
    result.deadlineKind = facts.openEnded.value
  }
  if (draft) {
    result.summary = draft.summary
    result.aiAssisted = true
    result.notes.push(
      `the AI draft (${draft.by}, ${draft.at.slice(0, 10)})${draft.place ? `, which gives the place as ${[draft.place.city, draft.place.country].filter(Boolean).join(', ')}` : ''}${draft.note ? `, with the note: ${draft.note}` : ''}`,
    )
  }
  if (!draft?.deadline && (facts?.deadline || facts?.openEnded)) {
    result.notes.push("the monitor's deadline")
  }
  if (tags && (subfields.length > 0 || methods.length > 0 || modelSystems.length > 0)) {
    result.notes.push('the suggested tags')
  }
  return result
}

/**
 * The draft job an accepted candidate becomes; the editor adds the facts and publishes it. What
 * the candidate offers (`prefill`) fills the job's fields; the rest start at the collection's
 * defaults.
 */
export function draftJob(candidate: Candidate, now: Date, taxonomy: Taxonomy | null = null) {
  const { notes, ...filled } = prefill(candidate, taxonomy)
  const started =
    notes.length > 0
      ? ` Started from ${notes.join(', ')}: check each against the original posting.`
      : ''
  return {
    title: candidate.rawTitle ?? '',
    institution: idOf(candidate.institution) as number,
    originalUrl: candidate.rawUrl ?? null,
    status: 'draft',
    deadlineKind: 'fixed',
    originalLanguage: 'en',
    linkStatus: 'unchecked',
    submission: (idOf(candidate.submission) as number | undefined) ?? null,
    source: (idOf(candidate.source) as number | undefined) ?? null,
    ...filled,
    internalNotes: `Made from candidate ${candidate.id} of the review queue, accepted on ${calendarDay(now)}.${started}`,
  } satisfies Partial<Job>
}

// After a save: an accepted candidate becomes a draft job, linked under "Job created", and a
// suggestion follows its candidate's decision (src/collections/Submissions.ts). Both run in the
// same transaction as the save (through `req`), so a failure undoes all of it.
const afterDecision: CollectionAfterChangeHook<Candidate> = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  let result = doc
  if (
    doc.status === 'accepted' &&
    previousDoc?.status !== 'accepted' &&
    idOf(doc.publishedRef) === undefined
  ) {
    const job = await req.payload.create({
      collection: 'jobs',
      data: draftJob(doc, new Date(), await loadTaxonomy(req.payload)),
      depth: 0,
      req,
    })
    const linked = await req.payload.update({
      collection: 'candidates',
      id: doc.id,
      data: { publishedRef: job.id },
      depth: 0,
      req,
    })
    result = { ...doc, publishedRef: job.id, updatedAt: linked.updatedAt }
  }
  const submission = idOf(doc.submission)
  if (
    submission !== undefined &&
    (operation === 'create' ||
      isDecided(doc.status) !== isDecided(previousDoc?.status) ||
      doc.decidedAt !== previousDoc?.decidedAt)
  ) {
    // The suggestion reads its status and decision time from this candidate.
    await req.payload.update({
      collection: 'submissions',
      id: submission,
      data: { candidate: doc.id },
      depth: 0,
      req,
      // A version restore sets isRestoringVersion on the shared request; without this, the
      // suggestion's missing fields are not filled from the saved suggestion and it fails validation.
      context: { isRestoringVersion: false },
    })
  }
  return result
}

// The queue is the record of every decision (PLAN §5.2), so a candidate is never deleted. Access
// control refuses it through the API and the admin; this hook covers code that bypasses it.
const keepCandidates: CollectionBeforeDeleteHook = ({ context }) => {
  if (isFakeData(context)) return
  throw new APIError(
    'Candidates are never deleted: the review queue keeps a record of every decision. Reject it instead.',
    403,
    null,
    true,
  )
}

// Bulk updates ("Edit many" in the admin, or an update by `where`) save every document in
// parallel, so the same-address check in validateStatus cannot see a job that another candidate
// in the same batch is about to make. Candidates are accepted one at a time.
const acceptOneAtATime: CollectionBeforeOperationHook = ({ args, operation }) => {
  // A save by ID runs this hook as 'update' too, with an ID and no `where`.
  const bulk = operation === 'update' && args.where != null && !('id' in args && args.id != null)
  if (bulk && (args.data as CandidateData | undefined)?.status === 'accepted') {
    throw new APIError(
      'Accept candidates one at a time: open each one, set it to Accepted and save.',
      400,
      null,
      true,
    )
  }
  return args
}

// Runs on every save: moves between statuses (accepted is final; a rejected or duplicate
// candidate is reopened as Triaged), and refuses to accept a posting that already has a job.
const validateStatus = async (value: unknown, options: Options) => {
  const { data, event, operation, previousValue, req } = options
  const status = (value ?? 'new') as CandidateStatus
  // In the admin form, the saved status is known once the form has loaded.
  if (operation === 'create' || previousValue !== undefined) {
    const from = operation === 'create' ? undefined : (previousValue as CandidateStatus | null)
    const problem = transitionProblem(from, status)
    if (problem) return problem
  }
  // The database is checked when saving, not while the form is being edited.
  if (status === 'accepted' && previousValue !== 'accepted' && event !== 'onChange') {
    const address = typeof data.rawUrl === 'string' ? canonicalUrl(data.rawUrl.trim()) : null
    if (address) {
      const { docs } = await req.payload.find({
        collection: 'jobs',
        where: { canonicalUrl: { equals: address } },
        select: { shortId: true, title: true },
        sort: 'id',
        depth: 0,
        limit: 1,
        pagination: false,
        req,
      })
      const job = docs[0]
      if (job) {
        return `A job with this address already exists: ${job.shortId} "${job.title}". Mark this candidate as a duplicate of that job instead.`
      }
    }
  }
  return validations.select(value as never, options as never)
}

const isStatus = (status: CandidateStatus) => (data: Partial<CandidateData> | undefined) =>
  data?.status === status

const sidebarDate = (name: string, label: string, description?: string): Field => ({
  name,
  label,
  type: 'date',
  index: true,
  // Set by the hooks only.
  access: { create: () => false, update: () => false },
  admin: {
    position: 'sidebar',
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm' },
    description,
  },
})

// PLAN §5.1, §6.3: the review queue. Every possible listing, from the "Suggest a listing" form,
// from editors or (from M7) from source monitors, is a candidate until an editor decides on it.
// Nothing is published from here: accepting makes a draft job, which the editor completes.
export const Candidates: CollectionConfig = {
  slug: 'candidates',
  labels: { singular: 'Candidate', plural: 'Candidates' },
  admin: {
    group: 'Review queue',
    useAsTitle: 'rawTitle',
    // The address tells apart candidates from suggestions, which have no title yet.
    defaultColumns: ['rawTitle', 'rawUrl', 'status', 'institution', 'createdAt'],
    listSearchableFields: ['rawTitle', 'rawUrl'],
    description:
      'The review queue, newest first (PLAN §6.3). Work through the New and Triaged candidates: open the original posting, check that it is on the employer\'s own page and still open, then fill in the title and institution. To accept, set the status to Accepted and save: a draft job is made and linked under "Job created"; open it, add the facts and publish it. Otherwise reject it with a reason, or mark it as a duplicate of a job. Candidates are never deleted: they record every decision.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-createdAt',
  // Signed-in editors; they add candidates by hand too (the form adds them through the local API).
  access: {
    read: signedIn,
    create: signedIn,
    update: signedIn,
    // Never, also not through the API (keepCandidates covers code that bypasses this).
    delete: nobody,
    readVersions: signedIn,
  },
  // A copy would be the duplicate the queue looks for.
  disableDuplicate: true,
  // Every decision and every reopening is kept (PLAN §5.2). Versions copy the source text too, so
  // the 30-day purge (M4.7) clears it in the versions as well (PLAN §20, M4 notes).
  versions: { maxPerDoc: 20 },
  hooks: {
    beforeOperation: [acceptOneAtATime],
    beforeValidate: [prepare],
    afterChange: [afterDecision],
    beforeDelete: [keepCandidates],
  },
  fields: [
    {
      name: 'rawUrl',
      label: 'Address of the posting',
      type: 'text',
      maxLength: 2000,
      validate: async (value: string | null | undefined, options: Options) => {
        if (!value) {
          return !(await accepting(options)) || 'Accepting needs the address of the posting.'
        }
        // Payload's own text check applies maxLength.
        return addressProblem(value) ?? validations.text(value, options as never)
      },
      admin: {
        description:
          "Open it and check it: accept only postings on the employer's own website, never on a job board or an agency's site (PLAN §6.1).",
      },
    },
    {
      name: 'rawTitle',
      label: 'Title as posted',
      type: 'text',
      maxLength: 300,
      validate: async (value: string | null | undefined, options: Options) =>
        !value && (await accepting(options))
          ? 'Accepting needs the title as the employer posted it.'
          : validations.text(value, options as never),
      admin: { description: 'The title exactly as the employer posted it, in its language.' },
    },
    {
      name: 'institution',
      type: 'relationship',
      relationTo: 'institutions',
      validate: async (value: unknown, options: Options) =>
        idOf(value) === undefined
          ? !(await accepting(options)) || 'Accepting needs the employer. Search by name or ROR ID.'
          : validations.relationship(value as never, options as never),
      admin: { description: 'The employer. Search by name or ROR ID. Needed to accept.' },
    },
    {
      name: 'possibleDuplicates',
      label: 'Possible duplicate jobs',
      type: 'relationship',
      relationTo: 'jobs',
      hasMany: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          'Jobs with the same address, and jobs not closed yet at the same institution with a similar title (PLAN §6.3), found when the candidate was last saved. If one is the same position, mark this candidate as its duplicate.',
      },
    },
    {
      name: 'possibleDuplicateCandidates',
      label: 'Other candidates with this address',
      type: 'relationship',
      relationTo: 'candidates',
      hasMany: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'Candidates for the same address that were not rejected.',
      },
    },
    {
      name: 'snippet',
      label: 'Source text',
      type: 'textarea',
      admin: {
        description:
          'Text from the source, such as a mailing-list announcement, for editors only. Never shown on the site or copied into a job; deleted 30 days after the decision (PLAN §5.1).',
      },
    },
    {
      name: 'extracted',
      label: 'Extracted facts',
      type: 'json',
      admin: {
        readOnly: true,
        description:
          "Facts a source monitor read from the posting, each with where it was found, to check against the original. An accepted candidate's job starts with its deadline.",
      },
    },
    {
      name: 'tagSuggestions',
      label: 'Suggested tags',
      type: 'json',
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          "Subfields, methods, model systems, position type and career stages whose words appear in the title or the source text (no AI, PLAN §6.3), with the words found. Suggestions only: an accepted candidate's job starts with them, and you check and change them there.",
      },
    },
    {
      name: 'aiSuggestion',
      label: 'AI draft',
      type: 'json',
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          'A draft by Claude from the redacted title and source text (PLAN §6.6): a summary in our own words, the position type, the deadline, the place, the subfields and the career stages, each saying what it came from. It is never shown on the site. Check every fact on the original posting.',
      },
    },
    {
      name: 'useAiDraft',
      label: 'Start the job from the AI draft',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        condition: (data) => Boolean(data?.aiSuggestion),
        description:
          'When accepted, the draft job takes its summary, position type, deadline, subfields and career stages (and is marked "Drafted with AI assistance"). Untick to start without it.',
      },
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
              'The address as https, without tracking parameters and fragments, for finding the same posting twice.',
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
      defaultValue: 'new',
      index: true,
      options: CANDIDATE_STATUSES.map(({ value, label }) => ({ value, label })),
      validate: validateStatus,
      admin: {
        position: 'sidebar',
        description:
          'Triaged: checked, not decided yet. Accepted makes a draft job and is final. A rejected or duplicate candidate can be reopened as Triaged.',
      },
    },
    {
      name: 'decisionReason',
      label: 'Reason',
      type: 'select',
      options: REJECTION_REASONS.map(({ value, label }) => ({ value, label })),
      validate: (value: string | null | undefined, options: Options) =>
        !value
          ? 'Choose why it is rejected.'
          : validations.select(value as never, options as never),
      admin: { position: 'sidebar', condition: isStatus('rejected') },
    },
    {
      name: 'duplicateOf',
      label: 'Duplicate of',
      type: 'relationship',
      relationTo: 'jobs',
      validate: (value: unknown, options: Options) =>
        idOf(value) === undefined
          ? 'Choose the job this candidate repeats.'
          : validations.relationship(value as never, options as never),
      admin: {
        position: 'sidebar',
        condition: isStatus('duplicate'),
        description: 'The job with the same position. Search by title or short ID.',
      },
    },
    {
      name: 'decisionNote',
      label: 'Decision note',
      type: 'textarea',
      validate: (value: string | null | undefined, options: Options) =>
        options.data.status === 'rejected' &&
        options.data.decisionReason === 'other' &&
        !value?.trim()
          ? 'Say why it is rejected.'
          : validations.textarea(value, options as never),
      admin: { position: 'sidebar', description: 'For editors only; never shown on the site.' },
    },
    sidebarDate('decidedAt', 'Decided', 'When it was accepted, rejected or marked as a duplicate.'),
    {
      name: 'publishedRef',
      label: 'Job created',
      type: 'relationship',
      relationTo: 'jobs',
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'The draft job made when the candidate was accepted: open it to add the facts and publish it.',
      },
    },
    {
      name: 'submission',
      label: 'From suggestion',
      type: 'relationship',
      relationTo: 'submissions',
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'The "Suggest a listing" suggestion it came from, with its note.',
      },
    },
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'sources',
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'The source it came from: set by the monitor, or by you for a posting found on a manual source.',
      },
    },
    {
      // Set when the candidate is made from a suggestion, and kept after the suggestion is deleted
      // (a data request), so the retention task still finds the suggested link (M4.7, D34).
      name: 'fromSuggestion',
      type: 'checkbox',
      defaultValue: false,
      access: { create: () => false, update: () => false },
      admin: { hidden: true },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'job',
      options: CANDIDATE_KINDS.map(({ value, label }) => ({ value, label })),
      admin: {
        position: 'sidebar',
        description: 'What it becomes when accepted. Events, funding and papers follow later.',
      },
    },
  ],
}
