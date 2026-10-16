import type { Payload, TypedUser, Where } from 'payload'

import { SOURCE_SCHEDULES } from './kinds'

// The sources' part of the admin dashboard (M7, D52; src/admin/ReviewDashboard.tsx): the new
// candidates the monitors found, by source; the sources that need an editor (failing, refused by
// robots.txt, terms changed); the manual sources due for a look; and the weekly link check's
// findings. Read with the editor's own access rights, each list bounded.

const DAY_MS = 86_400_000

/** How many rows each list shows. */
export const SOURCES_LIST_LIMIT = 10

export type SourceRow = { id: number; name: string; note: string | null; url?: string | null }

export type SourcesSummary = {
  found: { total: number; bySource: Array<{ id: number; name: string; count: number }> }
  attention: { total: number; rows: SourceRow[] }
  manualDue: { total: number; rows: SourceRow[] }
  links: { gone: number; broken: number; saysClosed: number }
}

/** New candidates that a source (a monitor, or an editor's manual source) found. */
export const newFromSourcesWhere: Where = {
  and: [{ status: { equals: 'new' } }, { source: { exists: true } }],
}

export const attentionWhere: Where = { needsAttention: { equals: true } }

/** Manual sources not looked at within their schedule (or never). */
export const manualDueWhere = (now: Date): Where => ({
  and: [
    { kind: { equals: 'manual' } },
    {
      or: [
        { lookedAt: { exists: false } },
        ...SOURCE_SCHEDULES.map(({ value, days }): Where => ({
          and: [
            { schedule: { equals: value } },
            { lookedAt: { less_than: new Date(now.getTime() - days * DAY_MS).toISOString() } },
          ],
        })),
      ],
    },
  ],
})

/** Published jobs whose link check found a problem that no editor has set aside. */
export const linkProblemWhere = (problem: 'gone' | 'broken' | 'says-closed'): Where => ({
  and: [
    { status: { equals: 'published' } },
    problem === 'says-closed'
      ? { linkSaysClosed: { equals: true } }
      : { linkStatus: { equals: problem } },
    { linkWarningDismissed: { not_equals: true } },
  ],
})

export async function sourcesSummary(
  payload: Payload,
  user: TypedUser,
  now: Date,
): Promise<SourcesSummary> {
  const asEditor = { overrideAccess: false, user } as const
  const [found, attention, manualDue, gone, broken, saysClosed] = await Promise.all([
    payload.find({
      collection: 'candidates',
      where: newFromSourcesWhere,
      select: { source: true },
      depth: 0,
      limit: 5000,
      pagination: false,
      ...asEditor,
    }),
    payload.find({
      collection: 'sources',
      where: attentionWhere,
      select: { name: true, attentionReason: true },
      sort: 'name',
      depth: 0,
      limit: SOURCES_LIST_LIMIT,
      ...asEditor,
    }),
    payload.find({
      collection: 'sources',
      where: manualDueWhere(now),
      select: { name: true, url: true, lookedAt: true },
      sort: 'lookedAt',
      depth: 0,
      limit: SOURCES_LIST_LIMIT,
      ...asEditor,
    }),
    payload.count({ collection: 'jobs', where: linkProblemWhere('gone'), ...asEditor }),
    payload.count({ collection: 'jobs', where: linkProblemWhere('broken'), ...asEditor }),
    payload.count({ collection: 'jobs', where: linkProblemWhere('says-closed'), ...asEditor }),
  ])

  const counts = new Map<number, number>()
  for (const doc of found.docs) {
    const id = typeof doc.source === 'object' ? doc.source?.id : doc.source
    if (typeof id === 'number') counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const top = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, SOURCES_LIST_LIMIT)
  const names =
    top.length === 0
      ? []
      : (
          await payload.find({
            collection: 'sources',
            where: { id: { in: top.map(([id]) => id) } },
            select: { name: true },
            depth: 0,
            limit: top.length,
            pagination: false,
            ...asEditor,
          })
        ).docs
  const nameOf = new Map(names.map((doc) => [doc.id, doc.name]))

  return {
    found: {
      total: found.docs.length,
      bySource: top.map(([id, count]) => ({ id, name: nameOf.get(id) ?? `Source ${id}`, count })),
    },
    attention: {
      total: attention.totalDocs,
      rows: attention.docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        note: doc.attentionReason ?? null,
      })),
    },
    manualDue: {
      total: manualDue.totalDocs,
      rows: manualDue.docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        url: doc.url,
        note: doc.lookedAt ? null : 'never looked at',
      })),
    },
    links: { gone: gone.totalDocs, broken: broken.totalDocs, saysClosed: saysClosed.totalDocs },
  }
}
