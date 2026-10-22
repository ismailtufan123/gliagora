import type { Payload } from 'payload'
import { z } from 'zod'

import { SUMMARY_MAX } from '@/lib/ai/draft'
import { calendarDay, storedDay } from '@/lib/jobs/deadline'
import { ORIGINAL_LANGUAGES } from '@/lib/jobs/languages'
import { canonicalUrl } from '@/lib/jobs/url'
import { isPlaceholderDeadline } from '@/lib/monitors/dates'
import { idOf } from '@/lib/relationship'
import { SHORT_ID_PATTERN } from '@/lib/short-id'
import { loadTaxonomy, termKey } from '@/lib/tags/terms'
import type { Vocabulary } from '@/lib/taxonomy'
import type { Job } from '@/payload-types'

import { deadlineSchema } from './decide'
import { refusalOf } from './errors'
import { personalDetails } from './rules'

// The operator's corrections in plain words ("remove this job", "change its deadline"), which
// Claude Code turns into a change of one job, found by its short ID, its ID, its address on the site
// or its original posting's address (D59). Applied through the collection, so its own rules hold
// (a published deadline that moves needs "Last verified" of today, set here: the operator's word
// is that day's check), and through the routine's: nothing published names a person or gives an
// email address, a phone number or a web address.

export const CHANGES_FORMAT = 'gliagora-job-changes/1'

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const changeSchema = z.strictObject({
  job: z.string().trim().min(1).max(2000),
  action: z.enum(['withdraw', 'set']),
  why: z.string().trim().min(3).max(300),
  set: z
    .strictObject({
      title: z.string().trim().min(1).max(300).optional(),
      summary: z.string().trim().min(1).max(SUMMARY_MAX).optional(),
      start: z.string().trim().min(1).max(100).nullable().optional(),
      deadline: deadlineSchema.optional(),
      institution: z.number().int().positive().optional(),
      language: z
        .enum(ORIGINAL_LANGUAGES.map(({ value }) => value) as [string, ...string[]])
        .optional(),
      positionType: slug.optional(),
      subfields: z.array(slug).min(1).max(4).optional(),
      careerStages: z.array(slug).max(4).optional(),
      methods: z.array(slug).max(6).optional(),
      modelSystems: z.array(slug).max(4).optional(),
    })
    .optional(),
})

export const changesSchema = z.strictObject({
  format: z.literal(CHANGES_FORMAT),
  changes: z.array(changeSchema).min(1).max(50),
})

export type ChangeResult = {
  /** The change's place in the file ("#2") or, once found, the job's short ID: never the input. */
  job: string
  outcome: 'changed' | 'withdrawn' | 'would-change' | 'not-found' | 'ambiguous' | 'refused'
  shortId?: string
  problem?: string
}

/**
 * The job `reference` names: an ID, a short ID, its address on the site or the posting's; 'two'
 * when it could be two jobs (an ID that is also another job's short ID, a posting address two jobs
 * share).
 */
async function findJob(payload: Payload, reference: string): Promise<Job | 'two' | null> {
  const value = reference.trim()
  const one = async (where: Record<string, unknown>) =>
    (
      await payload.find({
        collection: 'jobs',
        where: where as never,
        depth: 0,
        limit: 2,
        pagination: false,
      })
    ).docs
  if (/^\d+$/.test(value) || SHORT_ID_PATTERN.test(value)) {
    const byId = /^\d+$/.test(value)
      ? ((await payload.findByID({
          collection: 'jobs',
          id: Number(value),
          depth: 0,
          disableErrors: true,
        })) as Job | null)
      : null
    const byShortId = SHORT_ID_PATTERN.test(value)
      ? ((await one({ shortId: { equals: value } }))[0] ?? null)
      : null
    if (byId && byShortId && byId.id !== byShortId.id) return 'two'
    return byId ?? byShortId
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  // The site's own address ends with the short ID: /en/jobs/<slug>-<shortId>/.
  const own = /^\/en\/jobs\/[^/]*-([^/-]+)\/?$/.exec(url.pathname)
  if (own && SHORT_ID_PATTERN.test(own[1]!)) {
    const found = (await one({ shortId: { equals: own[1] } }))[0]
    if (found) return found
  }
  const canonical = canonicalUrl(value)
  if (!canonical) return null
  const matches = await one({ canonicalUrl: { equals: canonical } })
  return matches.length > 1 ? 'two' : (matches[0] ?? null)
}

/** Applies the operator's corrections. */
export async function applyChanges(
  payload: Payload,
  body: unknown,
  { dryRun = false, now = new Date() }: { dryRun?: boolean; now?: Date } = {},
): Promise<{ dryRun: boolean; results: ChangeResult[] }> {
  const parsed = changesSchema.parse(body)
  const day = calendarDay(now) as string
  const taxonomy = await loadTaxonomy(payload)
  const results: ChangeResult[] = []
  for (const [index, change] of parsed.changes.entries()) {
    const job = await findJob(payload, change.job)
    if (!job || job === 'two') {
      results.push({ job: `#${index + 1}`, outcome: job ? 'ambiguous' : 'not-found' })
      continue
    }
    const reference = job.shortId as string
    const notes = [
      job.internalNotes,
      `Update the jobs (D59), ${day}: ${change.action === 'withdraw' ? 'withdrawn' : 'changed'} on the operator's word: ${change.why}`,
    ]
      .filter(Boolean)
      .join('\n')
    let data: Partial<Job>
    if (change.action === 'withdraw') {
      data = { status: 'withdrawn', internalNotes: notes }
    } else {
      const set = change.set ?? {}
      const problems: string[] = [
        ['title', set.title],
        ['summary', set.summary],
        ['start', set.start],
      ].flatMap(([field, value]) => {
        const why = personalDetails(value)
        return why ? [`The ${field} cannot be published: ${why}.`] : []
      })
      const ids = (vocabulary: Vocabulary, slugs: readonly string[] | undefined) => {
        if (!slugs) return undefined
        const found = slugs.map((value) => taxonomy.byKey.get(termKey(vocabulary, value))?.id)
        if (found.some((id) => id === undefined)) {
          problems.push(`Unknown ${vocabulary} among ${slugs.join(', ')}.`)
          return undefined
        }
        return found.map(Number)
      }
      const positionType = ids('position-type', set.positionType ? [set.positionType] : undefined)
      const subfields = ids('subfield', set.subfields)
      const careerStages = ids('career-stage', set.careerStages)
      const methods = ids('method', set.methods)
      const modelSystems = ids('model-system', set.modelSystems)
      if (
        set.deadline?.kind === 'fixed' &&
        set.deadline.date &&
        isPlaceholderDeadline(set.deadline.date, now)
      ) {
        problems.push(`${set.deadline.date} is a placeholder: give "rolling" instead.`)
      }
      // A fixed deadline ends in the posting's zone, else the (new) institution's.
      const institutionId = set.institution ?? (idOf(job.institution) as number | undefined)
      const institution =
        institutionId === undefined
          ? null
          : await payload.findByID({
              collection: 'institutions',
              id: institutionId,
              select: { timeZone: true },
              depth: 0,
              disableErrors: true,
            })
      if (set.institution && !institution)
        problems.push(`Institution ${set.institution} is not ours.`)
      const fixed = (set.deadline?.kind ?? job.deadlineKind) === 'fixed'
      // A new deadline ends in the zone it names, else the institution's; a new institution
      // brings its own zone to the deadline it keeps.
      const zone = !fixed
        ? null
        : ((set.deadline?.timeZone ??
            (set.deadline || set.institution ? null : job.deadlineTz) ??
            institution?.timeZone ??
            null) as Job['deadlineTz'])
      const moved =
        Boolean(set.deadline) || (Boolean(set.institution) && fixed && zone !== job.deadlineTz)
      if (problems.length > 0) {
        results.push({
          job: reference,
          shortId: reference,
          outcome: 'refused',
          problem: problems.join(' '),
        })
        continue
      }
      data = {
        ...(set.title ? { title: set.title } : {}),
        ...(set.summary ? { summary: set.summary } : {}),
        ...(set.start !== undefined ? { startText: set.start } : {}),
        ...(set.institution ? { institution: set.institution } : {}),
        ...(set.language ? { originalLanguage: set.language as Job['originalLanguage'] } : {}),
        ...(positionType ? { positionType: positionType[0] } : {}),
        ...(subfields ? { subfields } : {}),
        ...(careerStages ? { careerStages } : {}),
        ...(methods ? { methods } : {}),
        ...(modelSystems ? { modelSystems } : {}),
        ...(set.deadline
          ? {
              deadlineKind: set.deadline.kind as Job['deadlineKind'],
              deadlineDate:
                set.deadline.kind === 'fixed' && set.deadline.date
                  ? storedDay(set.deadline.date)
                  : null,
            }
          : {}),
        ...(moved
          ? {
              deadlineTz: zone,
              // The operator's word is today's check of the deadline where it now ends.
              verifiedAt: storedDay(day),
            }
          : {}),
        internalNotes: notes,
      }
    }
    if (dryRun) {
      results.push({ job: reference, shortId: reference, outcome: 'would-change' })
      continue
    }
    try {
      await payload.update({ collection: 'jobs', id: job.id, data, depth: 0 })
      results.push({
        job: reference,
        shortId: reference,
        outcome: change.action === 'withdraw' ? 'withdrawn' : 'changed',
      })
    } catch (error) {
      results.push({
        job: reference,
        shortId: reference,
        outcome: 'refused',
        problem: refusalOf(error),
      })
    }
  }
  return { dryRun, results }
}
