import { type Locale, siteLocale } from '@/i18n/routing'
import { calendarDay, listingState } from '@/lib/jobs/deadline'
import { formatDay } from '@/lib/jobs/format'
import type { JobCard } from '@/lib/jobs/view'
import { SITE_ORIGIN } from '@/lib/site'

import { type DateValue, escapeXml, latestDate, rfc822Date } from './xml'

// The jobs feed (PLAN §2.2): /en/jobs/feed.xml, RSS 2.0, the 50 open positions published last.
// Each item carries the facts and our own summary in plain text, never text from the employer's
// posting (PLAN §15), and links to the job's page on Gliagora. Not in the sitemaps.

/** Positions in the feed. */
export const FEED_SIZE = 50

export const FEED_PATH = `/${siteLocale}/jobs/feed.xml`

/** An open job as the feed reads it. */
export type FeedJob = JobCard & {
  summary: string | null
  publishedAt: string | null
}

const timeOf = (value: string | null) => (value ? new Date(value).getTime() || 0 : 0)

/**
 * The jobs the feed lists: open ones only (PLAN §2.5), the most recently published first, at most
 * `limit`. The database query already asks for these; this keeps the rule in one tested place.
 */
export function feedJobs(jobs: readonly FeedJob[], now: Date, limit = FEED_SIZE): FeedJob[] {
  return jobs
    .filter((job) => listingState(job, now) === 'open')
    .sort((a, b) => timeOf(b.publishedAt) - timeOf(a.publishedAt) || b.id - a.id)
    .slice(0, limit)
}

/** The words of an item's description, from messages/{locale}.json. */
export type FeedTexts = {
  institution: (name: string) => string
  location: (place: string) => string
  place: (city: string, country: string) => string
  deadline: (date: string) => string
  rolling: string
  untilFilled: string
}

/**
 * An item's description, in plain text: our summary, then the institution, the place and the
 * deadline day ("Deadline: 14 Nov 2026."). No days left, so an item does not change every day.
 */
export function feedDescription(job: FeedJob, texts: FeedTexts, locale: Locale = 'en'): string {
  const { city, country } = job
  const place = city && country ? texts.place(city, country) : (city ?? country)
  const day = calendarDay(job.deadlineDate)
  const deadline =
    job.deadlineKind === 'rolling'
      ? texts.rolling
      : job.deadlineKind === 'until-filled'
        ? texts.untilFilled
        : day
          ? texts.deadline(formatDay(day, locale))
          : null
  return [
    job.summary,
    job.institution ? texts.institution(job.institution.name) : null,
    place ? texts.location(place) : null,
    deadline,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * A job's permanent address: its short ID alone, which redirects to the current URL. The feed
 * uses it as the item's guid, so a corrected title (a new slug) does not show the job twice in
 * feed readers.
 */
export const jobPermalink = (shortId: string) => `/${siteLocale}/jobs/${shortId}/`

const absolute = (path: string) => new URL(path, SITE_ORIGIN).href

export type FeedItem = {
  title: string
  link: string
  guid: string
  pubDate: DateValue | null
  description: string
}

/** A job as a feed item: its original title, its page on Gliagora and the day it was published. */
export function feedItem(job: FeedJob, texts: FeedTexts): FeedItem {
  return {
    title: job.title,
    link: absolute(job.path),
    guid: absolute(jobPermalink(job.shortId)),
    pubDate: job.publishedAt,
    description: feedDescription(job, texts),
  }
}

export type FeedChannel = {
  title: string
  description: string
  /** The page the feed belongs to: the jobs list. */
  link: string
  /** The feed's own address (atom:link rel="self"). */
  self: string
  language: string
}

/**
 * The feed as RSS 2.0, with atom:link rel="self" as feed validators recommend. No
 * `lastBuildDate` (optional in RSS 2.0): the channel also changes when a job leaves it, which the
 * dates of the jobs still listed cannot show, so their latest date would move back in time.
 */
export function rssXml(channel: FeedChannel, items: readonly FeedItem[]): string {
  const date = (value: DateValue | null) => {
    const found = latestDate([value])
    return found ? rfc822Date(found) : null
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${escapeXml(channel.language)}</language>`,
    `    <atom:link href="${escapeXml(channel.self)}" rel="self" type="application/rss+xml"/>`,
  ]
  for (const item of items) {
    const published = date(item.pubDate)
    lines.push(
      '    <item>',
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(item.link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(item.guid)}</guid>`,
      ...(published ? [`      <pubDate>${published}</pubDate>`] : []),
      `      <description>${escapeXml(item.description)}</description>`,
      '    </item>',
    )
  }
  lines.push('  </channel>', '</rss>', '')
  return lines.join('\n')
}
