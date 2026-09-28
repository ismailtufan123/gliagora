// Stores the fake review-queue data (src/scripts/fake-queue-data.ts) for `pnpm fake:jobs`
// (src/scripts/fake-jobs.ts), through the local API, so the collection hooks do what they do for
// real suggestions: a suggested position becomes a candidate, accepting one makes a draft job and
// a decision updates the suggestion.
import type { Payload } from 'payload'

import { FAKE_DATA } from '@/collections/Jobs'
import { idOf } from '@/lib/relationship'

import { type ItemLookup, type ItemRef, findReportItem, itemRefText } from '@/lib/reports/item'

import {
  FAKE_CANDIDATES,
  FAKE_QUEUE_NOTE,
  FAKE_REPORTS,
  FAKE_SUBMISSIONS,
  type FakeReview,
  type FakeSubmission,
} from './fake-queue-data'

// Lets the fake candidates be removed again, although candidates are never deleted otherwise.
const context = { fakeData: FAKE_DATA }

const ids = (values: unknown[]) =>
  values.map((value) => idOf(value)).filter((id): id is number => typeof id === 'number')

/**
 * Removes the fake suggestions, candidates and reports of an earlier run (including the reports
 * the end-to-end tests sent), and the draft jobs made by accepting candidates. Returns how many
 * suggestions, candidates and reports it removed.
 */
export async function removeFakeQueue(payload: Payload) {
  const reports = await payload.delete({
    collection: 'reports',
    where: { details: { contains: FAKE_QUEUE_NOTE } },
    depth: 0,
  })
  const submissions = await payload.find({
    collection: 'submissions',
    where: { note: { contains: FAKE_QUEUE_NOTE } },
    select: { candidate: true },
    depth: 0,
    pagination: false,
  })
  const fromSubmissions = ids(submissions.docs.map((doc) => doc.candidate))
  const candidates = await payload.find({
    collection: 'candidates',
    where: {
      or: [
        { snippet: { contains: FAKE_QUEUE_NOTE } },
        ...(fromSubmissions.length > 0 ? [{ id: { in: fromSubmissions } }] : []),
      ],
    },
    select: { publishedRef: true },
    depth: 0,
    pagination: false,
  })
  const jobs = ids(candidates.docs.map((doc) => doc.publishedRef))
  // An empty `in` would match nothing, but each delete is skipped then anyway.
  if (jobs.length > 0) {
    await payload.delete({ collection: 'jobs', where: { id: { in: jobs } }, depth: 0, context })
  }
  if (candidates.docs.length > 0) {
    await payload.delete({
      collection: 'candidates',
      where: { id: { in: candidates.docs.map((doc) => doc.id) } },
      depth: 0,
      context,
    })
  }
  if (submissions.docs.length > 0) {
    await payload.delete({
      collection: 'submissions',
      where: { id: { in: submissions.docs.map((doc) => doc.id) } },
      depth: 0,
      context,
    })
  }
  return {
    submissions: submissions.docs.length,
    candidates: candidates.docs.length,
    reports: reports.docs.length,
  }
}

type Lookups = {
  /** Institution IDs by ROR ID. */
  institutionId: Map<string, number>
  /** Job IDs by short ID. */
  jobId: Map<string, number>
}

/** Adds the fake suggestions and candidates. Returns the candidates by status. */
export async function addFakeQueue(payload: Payload, { institutionId, jobId }: Lookups) {
  const institution = (rorId: string) => {
    const id = institutionId.get(rorId)
    if (id === undefined) throw new Error(`Test institution missing: ${rorId}`)
    return id
  }
  const counts: Record<string, number> = {}

  // As an editor would: triage first (title and institution), then decide.
  const review = async (candidate: number, { status, ...facts }: FakeReview) => {
    await payload.update({
      collection: 'candidates',
      id: candidate,
      data: {
        status: 'triaged',
        rawTitle: facts.rawTitle,
        institution: institution(facts.institutionRorId),
      },
      depth: 0,
    })
    if (status === 'triaged') return
    let duplicateOf: number | undefined
    if (facts.duplicateOf) {
      duplicateOf = jobId.get(facts.duplicateOf)
      if (duplicateOf === undefined) throw new Error(`Fake job missing: ${facts.duplicateOf}`)
    }
    await payload.update({
      collection: 'candidates',
      id: candidate,
      data: {
        status,
        decisionReason: facts.decisionReason ?? null,
        decisionNote: facts.decisionNote ?? null,
        duplicateOf: duplicateOf ?? null,
      },
      depth: 0,
    })
  }

  for (const { review: reviewed, decided, ...submission } of FAKE_SUBMISSIONS as FakeSubmission[]) {
    const created = await payload.create({
      collection: 'submissions',
      data: { ...submission, status: 'new' },
      depth: 0,
    })
    const candidate = idOf(created.candidate)
    if (typeof candidate === 'number') {
      if (reviewed) await review(candidate, reviewed)
      const status = reviewed?.status ?? 'new'
      counts[status] = (counts[status] ?? 0) + 1
    } else if (decided) {
      await payload.update({
        collection: 'submissions',
        id: created.id,
        data: { status: 'decided' },
        depth: 0,
      })
    }
  }

  for (const { review: reviewed, institutionRorId, ...candidate } of FAKE_CANDIDATES) {
    const created = await payload.create({
      collection: 'candidates',
      data: {
        ...candidate,
        kind: 'job',
        status: 'new',
        institution: institutionRorId ? institution(institutionRorId) : null,
      },
      depth: 0,
    })
    if (reviewed) await review(created.id, reviewed)
    const status = reviewed?.status ?? 'new'
    counts[status] = (counts[status] ?? 0) + 1
  }
  // Reports as the form stores them, then handled as an editor would: In progress, then Closed.
  const now = new Date()
  const lookup: ItemLookup = {
    job: async (shortId) =>
      (
        await payload.find({
          collection: 'jobs',
          where: { shortId: { equals: shortId } },
          depth: 0,
          limit: 1,
        })
      ).docs[0] ?? null,
    institution: async (rorId) =>
      (
        await payload.find({
          collection: 'institutions',
          where: { rorId: { equals: rorId } },
          depth: 0,
          limit: 1,
        })
      ).docs[0] ?? null,
  }
  for (const { job, institution, status, action, actionNote, ...report } of FAKE_REPORTS) {
    const ref: ItemRef | null = job
      ? { type: 'job', shortId: job }
      : institution
        ? { type: 'institution', id: institution }
        : null
    // The item and the address of its page, as the form records them.
    const item = await findReportItem(ref, lookup, now)
    if (ref && !item) throw new Error(`Fake item missing: ${itemRefText(ref)}`)
    const created = await payload.create({
      collection: 'reports',
      data: {
        ...report,
        locale: 'en',
        job: item?.type === 'job' ? item.id : null,
        institution: item?.type === 'institution' ? item.id : null,
        itemUrl: item?.path ?? null,
        status: 'new',
      },
      depth: 0,
    })
    if (status === 'new') continue
    await payload.update({
      collection: 'reports',
      id: created.id,
      data: { status: 'in-progress', actionNote: actionNote ?? null },
      depth: 0,
    })
    if (status === 'closed') {
      await payload.update({
        collection: 'reports',
        id: created.id,
        data: { status: 'closed', action: action ?? null },
        depth: 0,
      })
    }
  }
  return { submissions: FAKE_SUBMISSIONS.length, candidates: counts, reports: FAKE_REPORTS.length }
}
