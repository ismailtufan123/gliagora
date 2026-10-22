import type { Payload } from 'payload'
import { z } from 'zod'

import { openJobsWhere } from '@/lib/jobs/query'
import { redacted } from '@/lib/redaction/redact'
import { idOf } from '@/lib/relationship'
import { linkProblemWhere, manualDueWhere } from '@/lib/sources/dashboard'

import { QUESTION_MARK } from './export'

// The short report that ends "Update the jobs" (D59, docs/update-jobs.md), and the institution
// search its decisions use. Counts, IDs, our own questions and the names of sources and
// institutions; never a candidate's text or a posting's address. The launch gate is PLAN §3.4's:
// at least 150 open positions in at least 25 countries, 12 subfields and 50 institutions.

export const LAUNCH_GATE = { positions: 150, countries: 25, subfields: 12, institutions: 50 }

export type RoutineReport = {
  at: string
  open: {
    positions: number
    countries: number
    subfields: number
    institutions: number
    byCountry: Array<{ country: string; positions: number }>
    bySubfield: Array<{ subfield: string; positions: number }>
    byInstitution: Array<{ id: number; name: string; positions: number }>
    publishedByRoutine: number
  }
  gate: typeof LAUNCH_GATE
  waiting: {
    total: number
    drafted: number
    bySource: Array<{ id: number | null; name: string; waiting: number }>
  }
  questions: Array<{ id: number; adminPath: string; question: string }>
  manualDue: Array<{ id: number; name: string; url: string; schedule: string; adminPath: string }>
  linkProblems: { gone: number; saysClosed: number; broken: number }
}

const sorted = <T extends { positions: number }>(rows: T[]) =>
  rows.sort((a, b) => b.positions - a.positions)

export async function routineReport(payload: Payload, now: Date): Promise<RoutineReport> {
  const open = await payload.find({
    collection: 'jobs',
    where: openJobsWhere(now),
    select: { country: true, institution: true, subfields: true, publishedByRoutine: true },
    depth: 0,
    limit: 10000,
    pagination: false,
  })
  const byCountry = new Map<string, number>()
  const bySubfield = new Map<number, number>()
  const byInstitution = new Map<number, number>()
  let byRoutine = 0
  for (const job of open.docs) {
    const country = idOf(job.country) as string | undefined
    if (country) byCountry.set(country, (byCountry.get(country) ?? 0) + 1)
    const institution = idOf(job.institution) as number | undefined
    if (institution !== undefined)
      byInstitution.set(institution, (byInstitution.get(institution) ?? 0) + 1)
    for (const term of job.subfields ?? []) {
      const id = Number(idOf(term))
      bySubfield.set(id, (bySubfield.get(id) ?? 0) + 1)
    }
    if (job.publishedByRoutine) byRoutine++
  }
  const [terms, institutions] = await Promise.all([
    payload.find({
      collection: 'terms',
      where: { id: { in: [...bySubfield.keys()] } },
      select: { slug: true },
      depth: 0,
      limit: 1000,
      pagination: false,
    }),
    payload.find({
      collection: 'institutions',
      where: { id: { in: [...byInstitution.keys()] } },
      select: { name: true, slug: true, rorId: true, shortId: true, lat: true, lng: true },
      depth: 0,
      limit: 10000,
      pagination: false,
    }),
  ])
  const slugs = new Map(terms.docs.map((term) => [term.id, term.slug as string]))
  const names = new Map(institutions.docs.map((institution) => [institution.id, institution.name]))
  // The gate counts the institutions the map pins, as the home page does (openJobsCoverage).
  const mapped = institutions.docs.filter(
    (doc) =>
      typeof doc.lat === 'number' &&
      typeof doc.lng === 'number' &&
      Boolean(doc.rorId || doc.shortId) &&
      Boolean(doc.slug),
  ).length

  const waiting = await payload.find({
    collection: 'candidates',
    where: { and: [{ status: { in: ['new', 'triaged'] } }, { kind: { equals: 'job' } }] },
    select: { source: true, aiSuggestion: true, status: true, decisionNote: true },
    depth: 0,
    limit: 10000,
    pagination: false,
  })
  const waitingBySource = new Map<number | null, number>()
  let drafted = 0
  const questions: RoutineReport['questions'] = []
  for (const candidate of waiting.docs) {
    const source = (idOf(candidate.source) as number | undefined) ?? null
    waitingBySource.set(source, (waitingBySource.get(source) ?? 0) + 1)
    if (candidate.aiSuggestion) drafted++
    const note = candidate.decisionNote ?? ''
    if (candidate.status === 'triaged' && note.startsWith(QUESTION_MARK)) {
      questions.push({
        id: candidate.id,
        adminPath: `/admin/collections/candidates/${candidate.id}`,
        // Redacted again: someone may have added to the note in the admin.
        question: (redacted(note) ?? '').slice(0, 600),
      })
    }
  }
  const sourceIds = [...waitingBySource.keys()].filter((id): id is number => id !== null)
  const [sources, due] = await Promise.all([
    payload.find({
      collection: 'sources',
      where: { id: { in: sourceIds } },
      select: { name: true },
      depth: 0,
      limit: 1000,
      pagination: false,
    }),
    payload.find({
      collection: 'sources',
      where: manualDueWhere(now),
      select: { name: true, url: true, schedule: true },
      sort: 'name',
      depth: 0,
      limit: 1000,
      pagination: false,
    }),
  ])
  const sourceNames = new Map(sources.docs.map((source) => [source.id, source.name]))
  const [gone, saysClosed, broken] = await Promise.all(
    (['gone', 'says-closed', 'broken'] as const).map(
      async (problem) =>
        (await payload.count({ collection: 'jobs', where: linkProblemWhere(problem) })).totalDocs,
    ),
  )
  return {
    at: now.toISOString(),
    open: {
      positions: open.docs.length,
      countries: byCountry.size,
      subfields: bySubfield.size,
      institutions: mapped,
      byCountry: sorted([...byCountry].map(([country, positions]) => ({ country, positions }))),
      bySubfield: sorted(
        [...bySubfield].map(([id, positions]) => ({
          subfield: slugs.get(id) ?? String(id),
          positions,
        })),
      ),
      byInstitution: sorted(
        [...byInstitution].map(([id, positions]) => ({
          id,
          name: names.get(id) ?? String(id),
          positions,
        })),
      ),
      publishedByRoutine: byRoutine,
    },
    gate: LAUNCH_GATE,
    waiting: {
      total: waiting.docs.length,
      drafted,
      bySource: [...waitingBySource]
        .map(([id, count]) => ({
          id,
          name:
            id === null
              ? '(no source: suggestions and editors)'
              : (sourceNames.get(id) ?? String(id)),
          waiting: count,
        }))
        .sort((a, b) => b.waiting - a.waiting),
    },
    questions,
    manualDue: due.docs.map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      schedule: source.schedule as string,
      adminPath: `/admin/collections/sources/${source.id}`,
    })),
    linkProblems: { gone: gone ?? 0, saysClosed: saysClosed ?? 0, broken: broken ?? 0 },
  }
}

export const institutionSearchSchema = z.strictObject({
  names: z.array(z.string().trim().min(2).max(200)).min(1).max(20),
})

/** Our institutions (ROR) whose name or alias holds each of `names`: ten at most each. */
export async function searchInstitutions(
  payload: Payload,
  body: unknown,
): Promise<
  Array<{
    name: string
    matches: Array<{
      id: number
      name: string
      city: string | null
      country: string | null
      ror: string | null
    }>
  }>
> {
  const { names } = institutionSearchSchema.parse(body)
  const results = []
  for (const name of names) {
    const { docs } = await payload.find({
      collection: 'institutions',
      where: { or: [{ name: { like: name } }, { aliases: { like: name } }] },
      select: { name: true, city: true, country: true, rorId: true },
      depth: 0,
      limit: 10,
      pagination: false,
    })
    results.push({
      name,
      matches: docs.map((institution) => ({
        id: institution.id,
        name: institution.name,
        city: institution.city ?? null,
        country: (idOf(institution.country) as string | undefined) ?? null,
        ror: (institution as { rorId?: string | null }).rorId ?? null,
      })),
    })
  }
  return results
}
