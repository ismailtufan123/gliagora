import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAINTENANCE_QUEUE, MANUAL_QUEUE } from '@/jobs/maintenance'
import { expireListings } from '@/jobs/maintenance/expireListings'
import { purgeFormLimits } from '@/jobs/maintenance/purgeFormLimits'
import {
  purgeReports,
  purgeRetention,
  purgeSnippets,
  purgeSuggestions,
  retireListings,
} from '@/jobs/maintenance/purgeRetention'
import { syncJobPlaces } from '@/jobs/maintenance/syncJobPlaces'
import { SKIPPED, withTaskLock } from '@/jobs/maintenance/task'
import { releaseInterruptedJobs } from '@/jobs/release'
import { matchDetailRoute, resolveDetailRoute } from '@/lib/detail-routes'
import { RETENTION } from '@/lib/retention/context'

import {
  DAY,
  HOUR,
  decide,
  institution,
  job,
  publishDraft,
  rows,
  suggestion,
  testPayload,
  unique,
} from './helpers'

// The scheduled maintenance tasks (M4.7) against a real, migrated database: what each deletes,
// what it keeps, and that a second run changes nothing.

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterAll(async () => {
  await payload?.destroy()
})

const ago = (ms: number, now = new Date()) => new Date(now.getTime() - ms).toISOString()
const monthsAgo = (months: number, now = new Date()) => {
  const date = new Date(now)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString()
}

describe('expireListings', () => {
  it('marks a published job whose deadline passed as expired, through the collection, once', async () => {
    const place = await institution(payload)
    const due = await job(payload, place.id)
    const open = await job(payload, place.id)
    const rolling = await job(payload, place.id, { deadlineKind: 'rolling' })
    // The collection refuses a past deadline on a published job, so the day ends in SQL.
    await rows(payload, sql`UPDATE jobs SET deadline_at = ${ago(HOUR)} WHERE id = ${due.id}`)
    const versionsBefore = await payload.countVersions({
      collection: 'jobs',
      where: { parent: { equals: due.id } },
    })

    const first = await expireListings(payload, new Date())
    expect(first.expired).toBeGreaterThanOrEqual(1)
    expect(first.failed).toBe(0)
    const expired = await payload.findByID({ collection: 'jobs', id: due.id, depth: 0 })
    expect(expired.status).toBe('expired')
    expect(expired.expiredAt).toBeTruthy()
    // As when an editor closes it: the two checks about the open position are cleared.
    expect(expired.checks).toMatchObject({
      positionOpen: false,
      deadlineConfirmed: false,
      employerOrigin: true,
    })
    // A normal save: kept as a version.
    const versionsAfter = await payload.countVersions({
      collection: 'jobs',
      where: { parent: { equals: due.id } },
    })
    expect(versionsAfter.totalDocs).toBe(versionsBefore.totalDocs + 1)
    for (const id of [open.id, rolling.id]) {
      expect((await payload.findByID({ collection: 'jobs', id, depth: 0 })).status).toBe(
        'published',
      )
    }

    expect(await expireListings(payload, new Date())).toEqual({ expired: 0, failed: 0 })
  })

  it('expires a job once when two runs meet', async () => {
    const place = await institution(payload)
    const due = await job(payload, place.id)
    await rows(payload, sql`UPDATE jobs SET deadline_at = ${ago(1000)} WHERE id = ${due.id}`)
    const runs = await Promise.all([
      expireListings(payload, new Date()),
      expireListings(payload, new Date()),
    ])
    expect(runs[0].expired + runs[1].expired).toBe(1)
    const versions = await payload.countVersions({
      collection: 'jobs',
      where: { parent: { equals: due.id } },
    })
    expect(versions.totalDocs).toBe(2)
  })
})

describe('purgeFormLimits', () => {
  it('deletes rows older than 23 hours and keeps the others', async () => {
    const now = new Date()
    const prefix = unique('test')
    const add = (key: string, at: string) =>
      rows(
        payload,
        sql`INSERT INTO form_limits (key, created_at, updated_at) VALUES (${`${prefix}:${key}`}, ${at}, ${at})`,
      )
    await add('day-old', ago(24 * HOUR, now))
    await add('just-over', ago(23 * HOUR + 1, now))
    await add('exactly-23-hours', ago(23 * HOUR, now))
    await add('recent', ago(HOUR, now))

    const first = await purgeFormLimits(payload, now)
    expect(first.deleted).toBeGreaterThanOrEqual(2)
    const left = await rows<{ key: string }>(
      payload,
      sql`SELECT key FROM form_limits WHERE key LIKE ${`${prefix}:%`} ORDER BY key`,
    )
    expect(left.map((row) => row.key)).toEqual([`${prefix}:exactly-23-hours`, `${prefix}:recent`])
    expect(await purgeFormLimits(payload, now)).toEqual({ deleted: 0 })
  })
})

describe('purgeSnippets', () => {
  async function candidateWithSnippet(decidedDaysAgo: number | null) {
    const place = await institution(payload)
    const created = await payload.create({
      collection: 'candidates',
      data: {
        kind: 'job',
        status: 'new',
        rawUrl: `https://www.example.org/jobs/${unique('snippet')}`,
        rawTitle: 'Fake research assistant position',
        snippet: 'Fake source text from a mailing list, naming a fake lab head.',
      },
      depth: 0,
    })
    if (decidedDaysAgo === null) {
      await payload.update({
        collection: 'candidates',
        id: created.id,
        data: { status: 'triaged', institution: place.id },
        depth: 0,
      })
      return created.id
    }
    await decide(payload, created.id, place.id, { status: 'rejected', reason: 'not-a-position' })
    await rows(
      payload,
      sql`UPDATE candidates SET decided_at = ${ago(decidedDaysAgo * DAY)} WHERE id = ${created.id}`,
    )
    return created.id
  }
  const snippets = (id: number) =>
    rows<{ snippet: string | null; versions: number }>(
      payload,
      sql`SELECT c.snippet,
        (SELECT count(*)::int FROM _candidates_v v WHERE v.parent_id = c.id AND v.version_snippet IS NOT NULL) AS versions
        FROM candidates c WHERE c.id = ${id}`,
    ).then((result) => result[0])

  it('deletes the source text 30 days after the decision, in the candidate and all its versions', async () => {
    const due = await candidateWithSnippet(30)
    const recent = await candidateWithSnippet(29)
    const open = await candidateWithSnippet(null)
    // Every save copied the text into a version.
    expect((await snippets(due))?.versions).toBeGreaterThanOrEqual(3)

    expect(await purgeSnippets(payload, new Date())).toBeGreaterThanOrEqual(1)
    expect(await snippets(due)).toEqual({ snippet: null, versions: 0 })
    const versions = await payload.countVersions({
      collection: 'candidates',
      where: { parent: { equals: due } },
    })
    expect(versions.totalDocs).toBeGreaterThanOrEqual(3)
    const kept = await payload.findByID({ collection: 'candidates', id: due, depth: 0 })
    expect(kept).toMatchObject({ status: 'rejected', decisionReason: 'not-a-position' })
    expect(kept.decidedAt).toBeTruthy()
    for (const id of [recent, open]) {
      const text = await snippets(id)
      expect(text?.snippet).toContain('Fake source text')
      expect(text?.versions).toBeGreaterThan(0)
    }
    expect(await purgeSnippets(payload, new Date())).toBe(0)
  })
})

/** Versions of candidate `id` that still hold the posting's address or title. */
const linkedVersions = async (id: number) =>
  (
    await rows<{ n: number }>(
      payload,
      sql`SELECT count(*)::int AS n FROM _candidates_v WHERE parent_id = ${id}
        AND (version_raw_url IS NOT NULL OR version_raw_title IS NOT NULL
          OR version_canonical_url IS NOT NULL OR version_fingerprint IS NOT NULL)`,
    )
  )[0]?.n

/** The candidate `id` as the database holds it: the posting's address and title facts. */
const linkFacts = async (id: number) =>
  (
    await rows<{
      raw_url: string | null
      raw_title: string | null
      canonical_url: string | null
      fingerprint: string | null
    }>(
      payload,
      sql`SELECT raw_url, raw_title, canonical_url, fingerprint FROM candidates WHERE id = ${id}`,
    )
  )[0]

const NO_LINK = { raw_url: null, raw_title: null, canonical_url: null, fingerprint: null }

describe('purgeSuggestions', () => {
  it('deletes suggestions 90 days after the decision, and the link and title of their rejected candidates', async () => {
    const place = await institution(payload)
    const rejected = await suggestion(payload, { email: 'rejected@example.org', consent: true })
    await decide(payload, rejected.candidateId, place.id, {
      status: 'rejected',
      reason: 'not-employer-page',
    })
    const accepted = await suggestion(payload, { email: 'accepted@example.org', consent: true })
    const acceptedCandidate = await decide(payload, accepted.candidateId, place.id, {
      status: 'accepted',
    })
    const draftJob = Number(acceptedCandidate.publishedRef)
    const duplicate = await suggestion(payload)
    await decide(payload, duplicate.candidateId, place.id, {
      status: 'duplicate',
      duplicateOf: draftJob,
    })
    const notYet = await suggestion(payload, { email: 'later@example.org', consent: true })
    await decide(payload, notYet.candidateId, place.id, { status: 'rejected', reason: 'closed' })
    const due = [rejected.id, accepted.id, duplicate.id]
    await rows(
      payload,
      sql`UPDATE submissions SET email_purge_at = ${ago(60_000)} WHERE id IN (${sql.join(
        due.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    // An editor opens the rejected candidate before the run, and saves it after.
    const openedBefore = await payload.findByID({
      collection: 'candidates',
      id: rejected.candidateId,
      depth: 0,
    })
    expect(openedBefore.fromSuggestion).toBe(true)

    const first = await purgeSuggestions(payload, new Date())
    expect(first.suggestions).toBeGreaterThanOrEqual(3)
    const left = await payload.find({
      collection: 'submissions',
      where: { id: { in: [...due, notYet.id] } },
      depth: 0,
    })
    expect(left.docs.map((doc) => doc.id)).toEqual([notYet.id])
    expect(left.docs[0]?.email).toBe('later@example.org')

    // Rejected and duplicate: the decision stays, the suggested link and title go, also from the
    // versions.
    for (const [id, status] of [
      [rejected.candidateId, 'rejected'],
      [duplicate.candidateId, 'duplicate'],
    ] as const) {
      const candidate = await payload.findByID({ collection: 'candidates', id, depth: 0 })
      expect(candidate).toMatchObject({ status, rawUrl: null, rawTitle: null, submission: null })
      expect(candidate.decidedAt).toBeTruthy()
      expect(await linkedVersions(id)).toBe(0)
    }
    // The form opened before the run sends the link and title back: they stay cleared, and the
    // rest of the save goes through.
    const stale = await payload.update({
      collection: 'candidates',
      id: rejected.candidateId,
      data: {
        rawUrl: openedBefore.rawUrl,
        rawTitle: openedBefore.rawTitle,
        status: openedBefore.status,
        decisionReason: openedBefore.decisionReason,
        decisionNote: 'Fake note, saved from a form opened before the purge.',
      },
      depth: 0,
    })
    expect(stale).toMatchObject({ rawUrl: null, rawTitle: null, canonicalUrl: null })
    expect(stale.decisionNote).toMatch(/opened before the purge/)
    expect(await linkFacts(rejected.candidateId)).toEqual(NO_LINK)
    expect(await linkedVersions(rejected.candidateId)).toBe(0)
    const rejectedCandidate = await payload.findByID({
      collection: 'candidates',
      id: rejected.candidateId,
      depth: 0,
    })
    expect(rejectedCandidate.decisionReason).toBe('not-employer-page')
    // Accepted: the address is the employer's page we published; the job keeps it too.
    const kept = await payload.findByID({
      collection: 'candidates',
      id: accepted.candidateId,
      depth: 0,
    })
    expect(kept.rawUrl).toBe(accepted.url)
    expect(Number(kept.publishedRef)).toBe(draftJob)
    const jobAfter = await payload.findByID({ collection: 'jobs', id: draftJob, depth: 0 })
    expect(jobAfter.originalUrl).toBe(accepted.url)
    expect(jobAfter.submission ?? null).toBeNull()

    expect(await purgeSuggestions(payload, new Date())).toEqual({ suggestions: 0, candidates: 0 })
  })

  it('clears the link of a candidate whose suggestion an editor deleted, 90 days after the decision', async () => {
    const place = await institution(payload)
    const backdate = (id: number, days: number) =>
      rows(payload, sql`UPDATE candidates SET decided_at = ${ago(days * DAY)} WHERE id = ${id}`)
    const remove = (id: number) => payload.delete({ collection: 'submissions', id, depth: 0 })
    // Rejected, then the suggestion deleted for a data request.
    const rejectedFirst = await suggestion(payload, { email: 'first@example.org', consent: true })
    await decide(payload, rejectedFirst.candidateId, place.id, {
      status: 'rejected',
      reason: 'not-a-position',
    })
    await remove(rejectedFirst.id)
    // The suggestion deleted while its candidate was still new; rejected later.
    const deletedFirst = await suggestion(payload, { email: 'second@example.org', consent: true })
    await remove(deletedFirst.id)
    const duplicateOf = await job(payload, place.id)
    await decide(payload, deletedFirst.candidateId, place.id, {
      status: 'duplicate',
      duplicateOf: duplicateOf.id,
    })
    // Not due yet, and a candidate an editor added by hand, which never had a suggestion.
    const recent = await suggestion(payload)
    await decide(payload, recent.candidateId, place.id, { status: 'rejected', reason: 'closed' })
    await remove(recent.id)
    const byHand = await payload.create({
      collection: 'candidates',
      data: {
        kind: 'job',
        status: 'new',
        rawUrl: `https://www.example.org/jobs/${unique('hand')}`,
      },
      depth: 0,
    })
    expect(byHand.fromSuggestion).toBe(false)
    await decide(payload, byHand.id, place.id, { status: 'rejected', reason: 'closed' })
    for (const id of [rejectedFirst.candidateId, deletedFirst.candidateId, byHand.id]) {
      await backdate(id, 100)
    }
    await backdate(recent.candidateId, 80)

    const first = await purgeSuggestions(payload, new Date())
    expect(first.candidates).toBeGreaterThanOrEqual(2)
    for (const [id, status] of [
      [rejectedFirst.candidateId, 'rejected'],
      [deletedFirst.candidateId, 'duplicate'],
    ] as const) {
      expect(await linkFacts(id)).toEqual(NO_LINK)
      expect(await linkedVersions(id)).toBe(0)
      const kept = await payload.findByID({ collection: 'candidates', id, depth: 0 })
      expect(kept).toMatchObject({ status, fromSuggestion: true, submission: null })
      expect(kept.decidedAt).toBeTruthy()
    }
    expect(
      (await payload.findByID({ collection: 'candidates', id: rejectedFirst.candidateId }))
        .decisionReason,
    ).toBe('not-a-position')
    for (const id of [recent.candidateId, byHand.id]) {
      expect((await linkFacts(id))?.raw_url).toMatch(/^https:\/\/www\.example\.org\/jobs\//)
      expect(await linkedVersions(id)).toBeGreaterThan(0)
    }

    expect(await purgeSuggestions(payload, new Date())).toEqual({ suggestions: 0, candidates: 0 })
  })
})

describe('retireListings', () => {
  it('keeps only the address and ID of a job offline for 12 months, and deletes it with its versions', async () => {
    const now = new Date()
    const place = await institution(payload)
    const old = await job(payload, place.id, {
      status: 'withdrawn',
      publishedAt: monthsAgo(15, now),
      withdrawnAt: monthsAgo(12, now),
    })
    await payload.update({
      collection: 'jobs',
      id: old.id,
      data: { internalNotes: 'Fake note, to make a second version.' },
      depth: 0,
    })
    const recent = await job(payload, place.id, {
      status: 'withdrawn',
      publishedAt: monthsAgo(15, now),
      withdrawnAt: monthsAgo(11, now),
    })
    // Closed 12 months and 29 days ago: gone (410) 12 months minus a day ago, so not yet due.
    const closedLate = await job(payload, place.id, {
      status: 'expired',
      deadlineKind: 'rolling',
      publishedAt: monthsAgo(15, now),
      expiredAt: new Date(new Date(monthsAgo(12, now)).getTime() - 29 * DAY).toISOString(),
    })
    // The review queue and a report point at the old job.
    const duplicate = await suggestion(payload)
    await decide(payload, duplicate.candidateId, place.id, {
      status: 'duplicate',
      duplicateOf: old.id,
    })
    // A job made from an accepted candidate, withdrawn 12 months ago.
    const suggested = await suggestion(payload)
    const accepted = await decide(payload, suggested.candidateId, place.id, { status: 'accepted' })
    const madeJob = await publishDraft(payload, Number(accepted.publishedRef))
    await rows(
      payload,
      sql`UPDATE jobs SET status = 'withdrawn', published_at = ${monthsAgo(15, now)},
        withdrawn_at = ${monthsAgo(12, now)}
        WHERE id = ${madeJob.id}`,
    )
    // An editor opens the accepted candidate before the run, and saves it after.
    const openedBefore = await payload.findByID({
      collection: 'candidates',
      id: suggested.candidateId,
      depth: 0,
    })
    expect(openedBefore.rawTitle).toBeTruthy()
    const report = await payload.create({
      collection: 'reports',
      data: {
        kind: 'wrong-fact',
        job: old.id,
        itemUrl: `/en/jobs/${old.slug}-${old.shortId}/`,
        details: 'Fake data (integration test). The deadline is wrong.',
        locale: 'en',
        status: 'new',
      },
      overrideAccess: true,
      depth: 0,
    })

    // By the short ID: deleting a job would set `parent_id` of any version left behind to null.
    const versionsOf = async (shortId: string) =>
      (
        await rows<{ n: number }>(
          payload,
          sql`SELECT count(*)::int AS n FROM _jobs_v WHERE version_short_id = ${shortId}`,
        )
      )[0]?.n
    // The create and the note made two.
    expect(await versionsOf(old.shortId as string)).toBeGreaterThanOrEqual(2)

    const first = await retireListings(payload, now)
    expect(first.failed).toBe(0)
    expect(first.retired).toBeGreaterThanOrEqual(2)
    for (const id of [old.id, madeJob.id]) {
      expect(
        await payload.findByID({ collection: 'jobs', id, depth: 0, disableErrors: true }),
      ).toBeNull()
    }
    expect(await versionsOf(old.shortId as string)).toBe(0)
    expect(await versionsOf(madeJob.shortId as string)).toBe(0)
    const retired = await payload.find({
      collection: 'retired-listings',
      where: { shortId: { equals: old.shortId } },
      depth: 0,
    })
    expect(retired.docs).toHaveLength(1)
    expect(retired.docs[0]).toMatchObject({ kind: 'job', shortId: old.shortId, slug: old.slug })
    // Decisions and reports keep what they were, without the link; candidates also without the
    // posting's address and title, in every version.
    const candidate = await payload.findByID({
      collection: 'candidates',
      id: duplicate.candidateId,
      depth: 0,
    })
    expect(candidate.status).toBe('duplicate')
    expect(candidate.duplicateOf ?? null).toBeNull()
    const acceptedAfter = await payload.findByID({
      collection: 'candidates',
      id: suggested.candidateId,
      depth: 0,
    })
    expect(acceptedAfter).toMatchObject({ status: 'accepted', institution: place.id })
    expect(acceptedAfter.publishedRef ?? null).toBeNull()
    expect(acceptedAfter.decidedAt).toBeTruthy()
    for (const id of [duplicate.candidateId, suggested.candidateId]) {
      expect(await linkFacts(id)).toEqual(NO_LINK)
      expect(await linkedVersions(id)).toBe(0)
    }
    // The form opened before the run sends the address and title back: they stay cleared, and an
    // accepted candidate without them can still be saved.
    const stale = await payload.update({
      collection: 'candidates',
      id: suggested.candidateId,
      data: {
        rawUrl: openedBefore.rawUrl,
        rawTitle: openedBefore.rawTitle,
        status: 'accepted',
        decisionNote: 'Fake note, saved from a form opened before the retirement.',
      },
      depth: 0,
    })
    expect(stale).toMatchObject({ rawUrl: null, rawTitle: null, canonicalUrl: null })
    expect(await linkedVersions(suggested.candidateId)).toBe(0)
    const reportAfter = await payload.findByID({ collection: 'reports', id: report.id, depth: 0 })
    expect(reportAfter.job ?? null).toBeNull()
    expect(reportAfter.itemUrl).toBe(`/en/jobs/${old.slug}-${old.shortId}/`)
    // Not due yet.
    for (const id of [recent.id, closedLate.id]) {
      expect(await payload.findByID({ collection: 'jobs', id, depth: 0 })).toBeTruthy()
    }

    // The address keeps answering 410; an ID nobody had stays unknown.
    const resolve = async (path: string) => {
      const route = matchDetailRoute(path)
      if (!route) throw new Error(`${path} is not a detail route`)
      const { detailLookup } = await import('@/lib/detail-lookup')
      return resolveDetailRoute(route, await detailLookup(), now)
    }
    expect(await resolve(`/en/jobs/${old.slug}-${old.shortId}/`)).toEqual({ action: 'gone' })
    expect(await resolve(`/en/jobs/${old.shortId}/`)).toEqual({ action: 'gone' })
    expect(await resolve('/en/jobs/no-such-job-zz9zz/')).toEqual({ action: 'notFound' })

    expect(await retireListings(payload, now)).toEqual({ retired: 0, failed: 0 })
  })

  it('refuses the retention flag for a job that is not due', async () => {
    const place = await institution(payload)
    const recent = await job(payload, place.id, {
      status: 'withdrawn',
      publishedAt: monthsAgo(3),
      withdrawnAt: monthsAgo(2),
    })
    await expect(
      payload.delete({ collection: 'jobs', id: recent.id, context: { retention: RETENTION } }),
    ).rejects.toThrow(/offline for 12 months/)
    await expect(payload.delete({ collection: 'jobs', id: recent.id })).rejects.toThrow(/Withdrawn/)
  })
})

describe('purgeReports', () => {
  async function report(status: 'new' | 'closed') {
    const created = await payload.create({
      collection: 'reports',
      data: {
        kind: 'wrong-fact',
        details: 'Fake data (integration test). A fact is wrong.',
        email: 'reporter@example.org',
        locale: 'en',
        status: 'new',
      },
      overrideAccess: true,
      depth: 0,
    })
    if (status === 'closed') {
      await payload.update({
        collection: 'reports',
        id: created.id,
        data: { status: 'in-progress' },
        depth: 0,
      })
      await payload.update({
        collection: 'reports',
        id: created.id,
        data: { status: 'closed', action: 'none' },
        depth: 0,
      })
    }
    return created.id
  }

  it('deletes closed reports 2 years after they were closed, and nothing else', async () => {
    const due = await report('closed')
    const closedRecently = await report('closed')
    const open = await report('new')
    await rows(payload, sql`UPDATE reports SET purge_at = ${ago(1000)} WHERE id = ${due}`)

    expect(await purgeReports(payload, new Date())).toBeGreaterThanOrEqual(1)
    const left = await payload.find({
      collection: 'reports',
      where: { id: { in: [due, closedRecently, open] } },
      depth: 0,
    })
    expect(left.docs.map((doc) => doc.id).sort()).toEqual([closedRecently, open].sort())
    expect(await purgeReports(payload, new Date())).toBe(0)
  })
})

describe('purgeRetention', () => {
  it('changes nothing on a second run', async () => {
    await purgeRetention(payload, new Date())
    expect(await purgeRetention(payload, new Date())).toEqual({
      snippets: 0,
      suggestions: 0,
      candidateLinks: 0,
      listings: 0,
      listingsFailed: 0,
      reports: 0,
      dataRequests: 0,
      unconfirmedRequests: 0,
      deletionLog: 0,
      consentLog: 0,
      sourcePostings: 0,
      sourceRuns: 0,
    })
  })
})

describe('syncJobPlaces', () => {
  it('copies an institution’s new place to its jobs, except those with a location of their own', async () => {
    const place = await institution(payload)
    const follows = await job(payload, place.id)
    const own = await job(payload, place.id, {
      locationOverride: { city: 'Heidelberg', country: 'DE' },
    })
    expect(follows.city).toBe('Berlin')
    // As the nightly ROR import would, without saving the jobs.
    await rows(payload, sql`UPDATE institutions SET city = 'Potsdam' WHERE id = ${place.id}`)

    const first = await syncJobPlaces(payload)
    expect(first.updated).toBeGreaterThanOrEqual(1)
    expect(first.failed).toBe(0)
    expect((await payload.findByID({ collection: 'jobs', id: follows.id, depth: 0 })).city).toBe(
      'Potsdam',
    )
    expect((await payload.findByID({ collection: 'jobs', id: own.id, depth: 0 })).city).toBe(
      'Heidelberg',
    )
    expect(await syncJobPlaces(payload)).toEqual({ updated: 0, failed: 0 })
  })
})

describe('scheduling', () => {
  it('releases jobs a restart left processing, in every queue, which would block their next scheduled run', async () => {
    await rows(payload, sql`DELETE FROM payload_jobs`)
    const stuck = await payload.jobs.queue({
      task: 'expireListings',
      input: {},
      queue: MAINTENANCE_QUEUE,
      meta: { scheduled: true },
    })
    const ror = await payload.jobs.queue({
      task: 'rorImport',
      input: {},
      queue: 'ror',
      meta: { scheduled: true },
    })
    await rows(
      payload,
      sql`UPDATE payload_jobs SET processing = true WHERE id IN (${stuck.id}, ${ror.id})`,
    )
    // The ROR queue has no release of its own at each tick (the maintenance queue has, below).
    const blocked = await payload.jobs.handleSchedules({ queue: 'ror' })
    expect(blocked.skipped.map((q) => q.taskConfig?.slug)).toContain('rorImport')

    await releaseInterruptedJobs(payload)
    const left = await rows<{ n: number }>(
      payload,
      sql`SELECT count(*)::int AS n FROM payload_jobs WHERE processing`,
    )
    expect(left[0]?.n).toBe(0)
    expect((await payload.findGlobal({ slug: 'ror-import' })).lastError).toMatch(/restart/)

    const scheduled = await payload.jobs.handleSchedules({ queue: 'ror' })
    expect(scheduled.queued.map((q) => q.taskConfig?.slug)).toContain('rorImport')
    await rows(payload, sql`DELETE FROM payload_jobs`)
  })

  it('releases a maintenance job left processing while the app kept running, at the next tick, unless a run holds its lock', async () => {
    await rows(payload, sql`DELETE FROM payload_jobs`)
    // PostgreSQL restarted while the task ran: Payload could not record the end of the job.
    const stuck = await payload.jobs.queue({
      task: 'purgeFormLimits',
      input: {},
      queue: MAINTENANCE_QUEUE,
      meta: { scheduled: true },
    })
    await rows(payload, sql`UPDATE payload_jobs SET processing = true WHERE id = ${stuck.id}`)
    const left = async () =>
      (await payload.count({ collection: 'payload-jobs', where: { id: { equals: stuck.id } } }))
        .totalDocs

    // While a run holds the task's lock, the job is left alone.
    let release: () => void = () => {}
    const running = withTaskLock(
      payload,
      'purgeFormLimits',
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    const during = await payload.jobs.handleSchedules({ queue: MAINTENANCE_QUEUE })
    expect(during.skipped.map((q) => q.taskConfig?.slug)).toContain('purgeFormLimits')
    expect(await left()).toBe(1)
    release()
    await running

    const next = await payload.jobs.handleSchedules({ queue: MAINTENANCE_QUEUE })
    expect(next.queued.map((q) => q.taskConfig?.slug)).toContain('purgeFormLimits')
    expect(await left()).toBe(0)
    await rows(payload, sql`DELETE FROM payload_jobs`)
  })

  it('runs a task through the job queue, as `pnpm jobs:run` does, and removes the finished job', async () => {
    const queued = await payload.jobs.queue({
      task: 'purgeFormLimits',
      input: {},
      queue: MANUAL_QUEUE,
    })
    await payload.jobs.runByID({ id: queued.id })
    const left = await payload.find({
      collection: 'payload-jobs',
      where: { id: { equals: queued.id } },
      depth: 0,
    })
    expect(left.docs).toHaveLength(0)
  })

  it('lets only one run of a task work at a time', async () => {
    let release: () => void = () => {}
    const holding = withTaskLock(
      payload,
      'lock-test',
      () => new Promise<string>((resolve) => (release = () => resolve('first'))),
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await withTaskLock(payload, 'lock-test', async () => 'second')).toBe(SKIPPED)
    release()
    expect(await holding).toBe('first')
    expect(await withTaskLock(payload, 'lock-test', async () => 'third')).toBe('third')
  })
})
