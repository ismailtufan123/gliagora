import { getTranslations } from 'next-intl/server'

import { JOB_FILTERS } from '@/lib/filters/jobs'
import { latestOpenJobs } from '@/lib/records'
import { FEED_PATH, FEED_SIZE, type FeedTexts, feedItem, feedJobs, rssXml } from '@/lib/seo/feed'
import { xmlResponse } from '@/lib/seo/responses'
import { SITE_ORIGIN } from '@/lib/site'
import { unavailableResponse } from '@/lib/unavailable'

// /en/jobs/feed.xml (PLAN §2.2): the 50 open positions published last, as RSS 2.0
// (src/lib/seo/feed.ts). `feed.xml` is reserved under /en/jobs/, so the proxy does not read it as
// a job's address (JOBS_RESERVED_SEGMENTS). Read from the database at request time; feed readers
// may keep it for an hour. Not in the sitemaps.
export const dynamic = 'force-dynamic'

export async function GET() {
  const now = new Date()
  let jobs
  try {
    jobs = feedJobs(await latestOpenJobs(now, FEED_SIZE, 'en'), now)
  } catch (error) {
    console.error('Jobs feed failed:', error instanceof Error ? error.message : error)
    return unavailableResponse()
  }
  const t = await getTranslations({ locale: 'en' })
  const texts: FeedTexts = {
    institution: (name) => t('jobs.feed.institution', { name }),
    location: (place) => t('jobs.feed.location', { place }),
    place: (city, country) => t('jobs.place', { city, country }),
    deadline: (date) => t('jobs.feed.deadline', { date }),
    rolling: t('jobs.feed.rolling'),
    untilFilled: t('jobs.feed.untilFilled'),
  }
  const xml = rssXml(
    {
      title: t('meta.titleTemplate', { title: t('jobs.feed.title') }),
      description: t('jobs.feed.description'),
      link: `${SITE_ORIGIN}${JOB_FILTERS.path}`,
      self: `${SITE_ORIGIN}${FEED_PATH}`,
      language: 'en',
    },
    jobs.map((job) => feedItem(job, texts)),
  )
  return xmlResponse(xml, 'application/rss+xml')
}
