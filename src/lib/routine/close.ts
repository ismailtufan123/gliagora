import type { Payload } from 'payload'

import { calendarDay } from '@/lib/jobs/deadline'
import { linkProblemWhere } from '@/lib/sources/dashboard'

import { refusalOf } from './errors'

// "Update the jobs" closes the published jobs whose original page the weekly link check found gone
// (404, 410) or saying the position is filled or closed (D59), unless an editor set the warning
// aside: withdrawn, so the job's address answers 410 at once, as the editor guide says for a
// posting the employer removed. Only findings of the last eight days count, so a page that has
// come back since an old check is not closed on that check's word.

const FRESH_DAYS = 8

export type CloseResult = {
  dryRun: boolean
  closed: Array<{ shortId: string; title: string; why: string }>
  refused: Array<{ shortId: string; problem: string }>
}

export async function closeGoneJobs(
  payload: Payload,
  now: Date,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<CloseResult> {
  const result: CloseResult = { dryRun, closed: [], refused: [] }
  const since = new Date(now.getTime() - FRESH_DAYS * 86_400_000).toISOString()
  const { docs } = await payload.find({
    collection: 'jobs',
    where: {
      and: [
        { or: [linkProblemWhere('gone'), linkProblemWhere('says-closed')] },
        { lastCheckedAt: { greater_than_equal: since } },
      ],
    },
    select: {
      shortId: true,
      title: true,
      linkStatus: true,
      linkSaysClosed: true,
      lastCheckedAt: true,
      internalNotes: true,
    },
    sort: 'id',
    depth: 0,
    limit: 1000,
    pagination: false,
  })
  const day = calendarDay(now) as string
  for (const job of docs) {
    const why =
      job.linkStatus === 'gone'
        ? 'the link check found its page gone'
        : 'the link check found its page saying the position is filled or closed'
    const checked = calendarDay(job.lastCheckedAt) ?? 'a recent day'
    if (!dryRun) {
      try {
        await payload.update({
          collection: 'jobs',
          id: job.id,
          data: {
            status: 'withdrawn',
            internalNotes: [
              job.internalNotes,
              `Update the jobs (D59), ${day}: withdrawn on the operator's command: ${why} (${checked}).`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          depth: 0,
        })
      } catch (error) {
        result.refused.push({ shortId: job.shortId as string, problem: refusalOf(error) })
        continue
      }
    }
    result.closed.push({ shortId: job.shortId as string, title: job.title, why })
  }
  return result
}
