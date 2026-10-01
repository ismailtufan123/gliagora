import type { JobCard } from '@/lib/jobs/view'
import {
  type OpenJobsCoverage,
  countOpenJobs,
  latestOpenJobs,
  nextDeadlines,
  openJobsByType,
  openJobsCoverage,
} from '@/lib/records'

// What the home page shows from the database (PLAN §3.2 "Home", §9.1): the live figures, each the
// number its link's list shows; the latest positions; the next deadlines; the position types.
// Read at most once every 10 minutes and kept here in between, so the home page costs the
// database a handful of queries per 10 minutes however often it is opened.

/** How long the figures and lists are kept (PLAN §3.2: cached for at most 10 minutes). */
export const HOME_DATA_MAX_AGE_MS = 10 * 60_000

/** Rows in "Latest positions" and "Deadlines coming up" (four of them on phones, in CSS). */
export const HOME_LIST_LENGTH = 6

export type HomeData = OpenJobsCoverage & {
  /** Open positions whose deadline day is in this month (`deadline=this-month`). */
  deadlinesThisMonth: number
  /** The positions published last, newest first. */
  latest: JobCard[]
  /** The fixed deadlines coming up, the nearest first. */
  deadlines: JobCard[]
  /** Position types with open positions, in taxonomy order. */
  types: { slug: string; label: string; jobs: number }[]
}

async function readHomeData(now: Date): Promise<HomeData> {
  const [coverage, deadlinesThisMonth, latest, deadlines, types] = await Promise.all([
    openJobsCoverage('en', now),
    countOpenJobs({ deadline: 'this-month' }, 'en', now),
    latestOpenJobs(now, HOME_LIST_LENGTH, 'en'),
    // One more than shown, in case one closes while the list is kept (dropped when shown).
    nextDeadlines('en', HOME_LIST_LENGTH + 1),
    openJobsByType('en', now),
  ])
  return { ...coverage, deadlinesThisMonth, latest, deadlines, types }
}

let kept: { at: number; data: HomeData } | null = null
let reading: Promise<HomeData> | null = null

/** The home page's data, at most 10 minutes old; requests that come while it is read share it. */
export function homeData(now: Date): Promise<HomeData> {
  if (kept && now.getTime() - kept.at < HOME_DATA_MAX_AGE_MS) return Promise.resolve(kept.data)
  reading ??= readHomeData(now)
    .then((data) => {
      kept = { at: now.getTime(), data }
      return data
    })
    .finally(() => {
      reading = null
    })
  return reading
}
