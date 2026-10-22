import type { Payload, PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { z } from 'zod'

import { inTransaction } from '@/jobs/maintenance/task'
import { type AiDraft, SUMMARY_MAX, storedDraft } from '@/lib/ai/draft'
import { jobPath } from '@/lib/detail-routes'
import { DEADLINE_KINDS, calendarDay, storedDay } from '@/lib/jobs/deadline'
import { ORIGINAL_LANGUAGES } from '@/lib/jobs/languages'
import { TIME_ZONES } from '@/lib/jobs/time-zones'
import { deadlineFromText, deadlineFromValidThrough, reviewDates } from '@/lib/monitors/dates'
import { type Fetcher, politeFetcher } from '@/lib/monitors/http'
import { lookAt } from '@/lib/monitors/links'
import { RobotsCache } from '@/lib/monitors/robots'
import { idOf } from '@/lib/relationship'
import { REJECTION_REASONS } from '@/lib/review/status'
import { storedFacts } from '@/lib/sources/facts'
import { notResearch } from '@/lib/tags/research'
import { type Taxonomy, loadTaxonomy, termKey } from '@/lib/tags/terms'
import type { Vocabulary } from '@/lib/taxonomy'
import type { Candidate, Institution, Job, Source } from '@/payload-types'

import { refusalOf } from './errors'
import { QUESTION_MARK } from './export'
import {
  type DeadlineFact,
  type Problem,
  WAIVABLE,
  blocking,
  endOf,
  publishProblems,
} from './rules'

// "Update the jobs" (D59, docs/update-jobs.md): the decisions Claude Code made, applied on the
// server through the operations route /api/ops/jobs/decide/ (src/lib/ops/auth.ts). A rejection and
// a question for the operator are saved as they are. A publication passes the written rules first
// (src/lib/routine/rules.ts), then the last look: the posting's page read once more by the link
// check's rules (robots.txt, the monitor's user agent, its pauses; one reader for the process, so
// the pauses hold across batches, and never while the monitors or the link check run). A page that
// is gone, says the position is closed or names a deadline that has passed rejects the candidate as
// closed; a page that does not answer leaves it for next time; a redirect or a page whose open
// deadline differs is refused unless the operator's word waives it. Only then, in one transaction,
// the candidate is accepted (the draft job made as for an editor's acceptance) and the job
// published, with "Last verified" the day of the last look and the mark "Published by Update the
// jobs". Answers hold IDs, outcomes and the rules' own words, never a posting's text or address.

export const DECISIONS_FORMAT = 'gliagora-job-decisions/1'

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const zones: ReadonlySet<string> = new Set(TIME_ZONES)
const why = z.string().trim().min(3).max(300)

export const deadlineSchema = z
  .strictObject({
    kind: z.enum(DEADLINE_KINDS.map(({ value }) => value) as [string, ...string[]]),
    date: z.iso.date().nullable(),
    timeZone: z
      .string()
      .refine((zone) => zones.has(zone), 'Not a time zone of the list')
      .nullable(),
  })
  .refine((deadline) => (deadline.kind === 'fixed') === (deadline.date !== null), {
    message: 'A fixed deadline has a day; a rolling or open one has none.',
  })

const reasons = REJECTION_REASONS.map(({ value }) => value) as [string, ...string[]]

export const decisionSchema = z
  .strictObject({
    id: z.number().int().positive(),
    decision: z.enum(['publish', 'reject', 'ask']),
    why,
    /** The operator's own word on this candidate. */
    byOperator: z.boolean().optional(),
    /** The judgements of the rules that the operator's word sets aside, each by name. */
    waive: z.array(z.enum(WAIVABLE)).max(WAIVABLE.length).optional(),
    reason: z.enum(reasons).optional(),
    question: z.string().trim().min(3).max(500).optional(),
    institution: z.number().int().positive().optional(),
    language: z
      .enum(ORIGINAL_LANGUAGES.map(({ value }) => value) as [string, ...string[]])
      .optional(),
    start: z.string().trim().min(1).max(100).nullable().optional(),
    summary: z.string().trim().min(1).max(SUMMARY_MAX).optional(),
    deadline: deadlineSchema.optional(),
    place: z
      .strictObject({
        city: z.string().trim().min(1).max(100).nullable(),
        country: z.string().regex(/^[A-Z]{2}$/),
      })
      .optional(),
    positionType: slug.optional(),
    subfields: z.array(slug).min(1).max(4).optional(),
    careerStages: z.array(slug).max(4).optional(),
    methods: z.array(slug).max(6).optional(),
    modelSystems: z.array(slug).max(4).optional(),
  })
  .refine((d) => d.decision !== 'reject' || d.reason !== undefined, {
    message: 'A rejection needs a reason.',
    path: ['reason'],
  })
  .refine((d) => d.decision !== 'ask' || d.question !== undefined, {
    message: 'A question for the operator needs the question.',
    path: ['question'],
  })
  .refine((d) => !d.waive?.length || d.byOperator === true, {
    message: 'Only the operator\'s word ("byOperator": true) waives a judgement.',
    path: ['waive'],
  })

export type Decision = z.infer<typeof decisionSchema>

/** The operator's rejection of every waiting candidate of a source (UCSF, CEBSIT's lists). */
const bySourceSchema = z.strictObject({
  source: z.number().int().positive(),
  decision: z.literal('reject'),
  reason: z.enum(reasons),
  why,
  byOperator: z.literal(true),
})

export const decisionsSchema = z
  .strictObject({
    format: z.literal(DECISIONS_FORMAT),
    decisions: z.array(decisionSchema).max(500),
    bySource: z.array(bySourceSchema).max(20).optional(),
  })
  .refine((body) => body.decisions.length > 0 || (body.bySource?.length ?? 0) > 0, {
    message: 'Nothing to decide.',
    path: ['decisions'],
  })

export type DecisionOutcome =
  | 'published'
  | 'would-publish'
  | 'rejected'
  | 'asked'
  | 'closed'
  | 'refused'
  | 'not-answering'
  | 'missing'
  | 'decided'

export type DecisionResult = {
  id: number
  outcome: DecisionOutcome
  /** The rules' words, the last look's finding or a refusal, never a posting's text. */
  problems?: string[]
  job?: { shortId: string; path: string }
}

export type DecideResult = {
  dryRun: boolean
  counts: Record<DecisionOutcome, number>
  results: DecisionResult[]
  bySource: Array<{ source: number; rejected: number; failed: number }>
}

export type DecideOptions = { dryRun?: boolean; fetcher?: Fetcher; now?: Date }

const OUTCOMES: readonly DecisionOutcome[] = [
  'published',
  'would-publish',
  'rejected',
  'asked',
  'closed',
  'refused',
  'not-answering',
  'missing',
  'decided',
]

const note = (day: string, text: string) => `Update the jobs (D59), ${day}: ${text}`

/** The reader of the last looks: one per process, so its pauses per site hold across batches. */
let shared: { fetcher: Fetcher; robots: RobotsCache; since: number } | null = null
const READER_HOURS = 6

function reader(given: Fetcher | undefined, now: Date): { fetcher: Fetcher; robots: RobotsCache } {
  if (given) return { fetcher: given, robots: new RobotsCache(given) }
  // robots.txt is read again for every run of the routine (a few hours apart at least).
  if (!shared || now.getTime() - shared.since > READER_HOURS * 3_600_000) {
    const fetcher = politeFetcher()
    shared = { fetcher, robots: new RobotsCache(fetcher), since: now.getTime() }
  }
  return shared
}

const institutionOf = (candidate: Candidate) =>
  candidate.institution && typeof candidate.institution === 'object'
    ? (candidate.institution as Institution)
    : null
const sourceOf = (candidate: Candidate) =>
  candidate.source && typeof candidate.source === 'object' ? (candidate.source as Source) : null

/** The deadline a decision publishes: its own, else the draft's, else the monitor's facts'. */
function deadlineOf(decision: Decision, draft: AiDraft, candidate: Candidate): DeadlineFact | null {
  if (decision.deadline) return decision.deadline as DeadlineFact
  if (draft.deadline) {
    return {
      kind: draft.deadline.kind as DeadlineFact['kind'],
      date: draft.deadline.date,
      timeZone: draft.deadline.timeZone,
    }
  }
  const facts = storedFacts(candidate.extracted)
  if (facts?.deadline) {
    return {
      kind: 'fixed',
      date: facts.deadline.value.date,
      timeZone: facts.deadline.value.timeZone,
    }
  }
  if (facts?.openEnded) return { kind: facts.openEnded.value, date: null, timeZone: null }
  return null
}

/** The ids of `slugs` in `vocabulary`, or the slug that is not one of its terms. */
function termIds(
  taxonomy: Taxonomy,
  vocabulary: Vocabulary,
  slugs: readonly string[],
): { ids: number[] } | { unknown: string } {
  const ids: number[] = []
  for (const value of slugs) {
    const id = taxonomy.byKey.get(termKey(vocabulary, value))?.id
    if (id === undefined) return { unknown: `${vocabulary} "${value}"` }
    ids.push(Number(id))
  }
  return { ids }
}

/**
 * The page's own deadline as the last look reads it, if it names a fixed one: its JobPosting data
 * (unless that is a review date) or the text.
 */
function pageDeadline(
  page: NonNullable<Awaited<ReturnType<typeof lookAt>>['page']>,
  country: string | null,
  now: Date,
): string | null {
  const reviews = reviewDates(page.text, country, now)
  const data = deadlineFromValidThrough(page.jobPosting?.validThrough, now)
  const text = deadlineFromText(page.text, country, now)
  const fromData = data && !reviews.has(data.date) ? data : null
  if (fromData && text) return text.date > fromData.date ? text.date : fromData.date
  return (fromData ?? text)?.date ?? null
}

/** Applies the decisions of one "Update the jobs" run. */
export async function applyDecisions(
  payload: Payload,
  body: unknown,
  options: DecideOptions = {},
): Promise<DecideResult> {
  const parsed = decisionsSchema.parse(body)
  const now = options.now ?? new Date()
  const day = calendarDay(now) as string
  const dryRun = options.dryRun ?? false
  const { fetcher, robots } = reader(options.fetcher, now)
  const taxonomy = await loadTaxonomy(payload)
  const counts = Object.fromEntries(OUTCOMES.map((key) => [key, 0])) as Record<
    DecisionOutcome,
    number
  >
  const results: DecisionResult[] = []
  const seen = new Set<number>()
  for (const decision of parsed.decisions) {
    if (seen.has(decision.id)) continue
    seen.add(decision.id)
    let result: DecisionResult
    try {
      result = await applyOne(payload, decision, { dryRun, now, day, fetcher, robots, taxonomy })
    } catch (error) {
      result = { id: decision.id, outcome: 'refused', problems: [refusalOf(error)] }
    }
    counts[result.outcome]++
    results.push(result)
  }
  const bySource: DecideResult['bySource'] = []
  for (const entry of parsed.bySource ?? []) {
    const { docs } = await payload.find({
      collection: 'candidates',
      where: {
        and: [{ source: { equals: entry.source } }, { status: { in: ['new', 'triaged'] } }],
      },
      select: {},
      depth: 0,
      limit: 1000,
      pagination: false,
    })
    let rejected = 0
    let failed = 0
    for (const { id } of docs) {
      if (dryRun) {
        rejected++
        continue
      }
      try {
        await payload.update({
          collection: 'candidates',
          id,
          data: {
            status: 'rejected',
            decisionReason: entry.reason as Candidate['decisionReason'],
            decisionNote: note(
              day,
              `rejected on the operator's decision for every candidate of this source: ${entry.why}`,
            ),
          },
          depth: 0,
        })
        rejected++
      } catch {
        failed++
      }
    }
    bySource.push({ source: entry.source, rejected, failed })
  }
  return { dryRun, counts, results, bySource }
}

type Context = {
  dryRun: boolean
  now: Date
  day: string
  fetcher: Fetcher
  robots: RobotsCache
  taxonomy: Taxonomy
}

/** The job an accepted candidate became, for an answer that repeats a decision already made. */
async function jobOf(payload: Payload, candidate: Candidate): Promise<DecisionResult['job']> {
  const id = idOf(candidate.publishedRef) as number | undefined
  if (id === undefined) return undefined
  const job = await payload.findByID({ collection: 'jobs', id, depth: 0, disableErrors: true })
  return job?.shortId && job.slug
    ? { shortId: job.shortId, path: jobPath(job.slug, job.shortId) }
    : undefined
}

async function applyOne(
  payload: Payload,
  decision: Decision,
  context: Context,
): Promise<DecisionResult> {
  const { dryRun, now, day } = context
  const id = decision.id
  const candidate = (await payload.findByID({
    collection: 'candidates',
    id,
    depth: 1,
    disableErrors: true,
  })) as Candidate | null
  if (!candidate || candidate.kind !== 'job') return { id, outcome: 'missing' }
  if (!['new', 'triaged'].includes(candidate.status)) {
    return { id, outcome: 'decided', job: await jobOf(payload, candidate) }
  }
  const by = decision.byOperator ? " (the operator's decision)" : ''
  const waived = decision.byOperator ? (decision.waive ?? []) : []

  if (decision.decision === 'reject') {
    if (!dryRun) {
      await payload.update({
        collection: 'candidates',
        id,
        data: {
          status: 'rejected',
          decisionReason: decision.reason as Candidate['decisionReason'],
          decisionNote: note(day, `rejected${by}. ${decision.why}`),
        },
        depth: 0,
      })
    }
    return { id, outcome: 'rejected' }
  }
  if (decision.decision === 'ask') {
    if (!dryRun) {
      await payload.update({
        collection: 'candidates',
        id,
        data: {
          status: 'triaged',
          decisionNote: `${QUESTION_MARK} (Update the jobs, ${day}): ${decision.question} ${decision.why}`,
        },
        depth: 0,
      })
    }
    return { id, outcome: 'asked' }
  }

  // Publishing.
  const draft = storedDraft(candidate.aiSuggestion)
  if (!draft) return { id, outcome: 'refused', problems: ['It has no AI draft yet.'] }
  const source = sourceOf(candidate)
  let institution = institutionOf(candidate)
  if (decision.institution !== undefined) {
    institution = (await payload.findByID({
      collection: 'institutions',
      id: decision.institution,
      depth: 0,
      disableErrors: true,
    })) as Institution | null
    if (!institution) {
      return {
        id,
        outcome: 'refused',
        problems: [`Institution ${decision.institution} is not ours.`],
      }
    }
  }
  const facts = storedFacts(candidate.extracted)
  const published = facts?.published?.value
  const deadline = deadlineOf(decision, draft, candidate)
  const summary = decision.summary ?? draft.summary
  const title = candidate.rawTitle ?? ''
  const problems: Problem[] = publishProblems(
    {
      title,
      summary,
      startText: decision.start ?? null,
      city: decision.place?.city ?? null,
      deadline,
      institutionTimeZone: institution?.timeZone ?? null,
      published: published && /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : null,
      hasInstitution: Boolean(institution),
      severalSites: Boolean(source?.severalSites),
      institutionChosen: decision.institution !== undefined,
      notResearch: notResearch(title),
    },
    now,
  )
  const terms: Partial<
    Record<'positionType' | 'subfields' | 'careerStages' | 'methods' | 'modelSystems', number[]>
  > = {}
  for (const [field, vocabulary, value] of [
    ['positionType', 'position-type', decision.positionType ? [decision.positionType] : undefined],
    ['subfields', 'subfield', decision.subfields],
    ['careerStages', 'career-stage', decision.careerStages],
    ['methods', 'method', decision.methods],
    ['modelSystems', 'model-system', decision.modelSystems],
  ] as const) {
    if (!value) continue
    const found = termIds(context.taxonomy, vocabulary, value)
    if ('unknown' in found) {
      problems.push({ rule: 'terms', message: `Unknown ${found.unknown}.`, hard: true })
    } else {
      terms[field] = found.ids
    }
  }
  if (!candidate.rawUrl) {
    problems.push({ rule: 'page', message: 'It has no address of the posting.', hard: true })
  }
  const stopping = blocking(problems, waived)
  if (stopping.length > 0) {
    return { id, outcome: 'refused', problems: stopping.map((problem) => problem.message) }
  }
  if (dryRun) return { id, outcome: 'would-publish' }

  // The last look (D59): the page once more, by the link check's rules. Its note can name an
  // address, so the answer says what was found in words of its own; the admin keeps the note.
  const look = await lookAt(context.fetcher, context.robots, candidate.rawUrl as string)
  const close = async (finding: string) => {
    await payload.update({
      collection: 'candidates',
      id,
      data: {
        status: 'rejected',
        decisionReason: 'closed',
        decisionNote: note(day, `the last look before publishing found it closed. ${finding}`),
      },
      depth: 0,
    })
  }
  if (look.status === 'gone' || look.saysClosed) {
    await close(look.note)
    return {
      id,
      outcome: 'closed',
      problems: [look.saysClosed ? `The page says: "${look.saysClosed}".` : 'The page is gone.'],
    }
  }
  if (look.status === 'broken') {
    return { id, outcome: 'not-answering', problems: ['The page did not answer.'] }
  }
  if (look.status === null) {
    return { id, outcome: 'refused', problems: ['robots.txt does not allow a last look.'] }
  }
  if (look.status === 'redirect' && !waived.includes('redirect')) {
    return {
      id,
      outcome: 'refused',
      problems: ['The page redirects to another address: check that the posting is still there.'],
    }
  }
  if (look.page && deadline) {
    const country = (idOf(institution?.country) as string | undefined) ?? null
    const onPage = pageDeadline(look.page, country, now)
    const zone = deadline.kind === 'fixed' ? deadline.timeZone : null
    // A deadline on the page that has passed closes it, whatever was decided.
    if (onPage && endOf(onPage, zone, institution?.timeZone ?? null) <= now) {
      await close(`The page's deadline, ${onPage}, has passed.`)
      return { id, outcome: 'closed', problems: [`The page's deadline, ${onPage}, has passed.`] }
    }
    const differs = onPage && (deadline.kind !== 'fixed' || onPage !== deadline.date)
    if (differs && !waived.includes('page-deadline')) {
      return {
        id,
        outcome: 'refused',
        problems: [
          `The page's deadline is ${onPage}, the decision's ${deadline.kind === 'fixed' ? deadline.date : deadline.kind}.`,
        ],
      }
    }
  }

  const job = await inTransaction(payload, async (req) => {
    await payload.update({
      collection: 'candidates',
      id,
      data: {
        status: 'accepted',
        useAiDraft: true,
        ...(institution ? { institution: institution.id } : {}),
        decisionNote: note(day, `published on the operator's command${by}. ${decision.why}`),
      },
      depth: 0,
      req,
    })
    const accepted = await payload.findByID({ collection: 'candidates', id, depth: 0, req })
    const jobId = idOf(accepted.publishedRef) as number | undefined
    if (jobId === undefined) throw new APIError('Accepting made no draft job.')
    return publishJob(payload, req, jobId, {
      decision,
      deadline: deadline as DeadlineFact,
      summary,
      institution: institution as Institution,
      terms,
      day,
      note: note(
        day,
        `published on the operator's command by "Update the jobs"${by}: ${decision.why}${waived.length ? ` (waived: ${waived.join(', ')})` : ''} Last look: ${look.note}`,
      ),
    })
  })
  return {
    id,
    outcome: 'published',
    job: { shortId: job.shortId, path: jobPath(job.slug, job.shortId) },
  }
}

/** The draft job made by accepting, completed from the decision and published. */
async function publishJob(
  payload: Payload,
  req: PayloadRequest,
  jobId: number,
  {
    decision,
    deadline,
    summary,
    institution,
    terms,
    day,
    note: text,
  }: {
    decision: Decision
    deadline: DeadlineFact
    summary: string
    institution: Institution
    terms: Partial<Record<string, number[]>>
    day: string
    note: string
  },
): Promise<{ shortId: string; slug: string }> {
  const draftJob = await payload.findByID({ collection: 'jobs', id: jobId, depth: 0, req })
  const place = decision.place
  const institutionCountry = idOf(institution.country) as string | undefined
  const away =
    place &&
    (place.country !== institutionCountry ||
      (place.city !== null && place.city.toLowerCase() !== (institution.city ?? '').toLowerCase()))
  const fixed = deadline.kind === 'fixed' && deadline.date
  const data: Partial<Job> = {
    status: 'published',
    institution: institution.id,
    summary,
    deadlineKind: deadline.kind,
    deadlineDate: fixed ? storedDay(deadline.date as string) : null,
    // The zone the rules checked: the posting's, else the institution's.
    deadlineTz: fixed
      ? ((deadline.timeZone ?? institution.timeZone ?? null) as Job['deadlineTz'])
      : null,
    originalLanguage: (decision.language ?? 'en') as Job['originalLanguage'],
    ...(decision.start !== undefined ? { startText: decision.start } : {}),
    ...(away ? { locationOverride: { city: place.city, country: place.country } } : {}),
    ...(terms.positionType ? { positionType: terms.positionType[0] } : {}),
    ...(terms.subfields ? { subfields: terms.subfields } : {}),
    ...(terms.careerStages ? { careerStages: terms.careerStages } : {}),
    ...(terms.methods ? { methods: terms.methods } : {}),
    ...(terms.modelSystems ? { modelSystems: terms.modelSystems } : {}),
    checks: {
      employerOrigin: true,
      positionOpen: true,
      deadlineConfirmed: true,
      ownWords: true,
      noPersonalContacts: true,
    },
    verifiedAt: storedDay(day),
    aiAssisted: true,
    publishedByRoutine: true,
    internalNotes: [draftJob.internalNotes, text].filter(Boolean).join('\n'),
  }
  const saved = await payload.update({ collection: 'jobs', id: jobId, data, depth: 0, req })
  return { shortId: saved.shortId as string, slug: saved.slug as string }
}
