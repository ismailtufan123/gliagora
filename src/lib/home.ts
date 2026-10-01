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
// number its link's list shows, and the position types, read at most once every 10 minutes and
// kept here in between (and read again when the month changes, for "deadlines this month"); and
// the latest positions and the next deadlines, two short queries read with each request, so they
// never show a position that has closed or been withdrawn since.

/** How long the figures are kept (PLAN §3.2: cached for at most 10 minutes). */
export const HOME_FIGURES_MAX_AGE_MS = 10 * 60_000

/** Rows in "Latest positions" and "Deadlines coming up" (four of them on phones, in CSS). */
export const HOME_LIST_LENGTH = 6

export type HomeFigures = OpenJobsCoverage & {
  /** Open positions whose deadline day is in this month (`deadline=this-month`). */
  deadlinesThisMonth: number
  /** Position types with open positions, in taxonomy order. */
  types: { slug: string; label: string; jobs: number }[]
}

export type HomeData = HomeFigures & {
  /** The positions published last, newest first. */
  latest: JobCard[]
  /** The fixed deadlines coming up, the nearest first. */
  deadlines: JobCard[]
}

async function readFigures(now: Date): Promise<HomeFigures> {
  const [coverage, deadlinesThisMonth, types] = await Promise.all([
    openJobsCoverage('en', now),
    countOpenJobs({ deadline: 'this-month' }, 'en', now),
    openJobsByType('en', now),
  ])
  return { ...coverage, deadlinesThisMonth, types }
}

/** When figures read at `at` must be read again: after 10 minutes, or when the month changes. */
export function figuresKeptUntil(at: Date): number {
  const nextMonth = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)
  return Math.min(at.getTime() + HOME_FIGURES_MAX_AGE_MS, nextMonth)
}

let kept: { until: number; figures: HomeFigures } | null = null
let reading: Promise<HomeFigures> | null = null

/** The figures, kept as above; requests that come while they are read share the read. */
export function homeFigures(now: Date): Promise<HomeFigures> {
  if (kept && now.getTime() < kept.until) return Promise.resolve(kept.figures)
  reading ??= readFigures(now)
    .then((figures) => {
      kept = { until: figuresKeptUntil(now), figures }
      return figures
    })
    .finally(() => {
      reading = null
    })
  return reading
}

/** Everything the home page shows from the database. */
export async function homeData(now: Date): Promise<HomeData> {
  const [figures, latest, deadlines] = await Promise.all([
    homeFigures(now),
    latestOpenJobs(now, HOME_LIST_LENGTH, 'en'),
    nextDeadlines('en', HOME_LIST_LENGTH),
  ])
  return { ...figures, latest, deadlines }
}
