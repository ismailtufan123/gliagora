import { createTranslator } from 'next-intl'

import { deadlineEnd } from '@/lib/jobs/deadline'
import { formatDay, timeZoneLabel } from '@/lib/jobs/format'

import en from '../../../../messages/en.json'
import type { IssueJob } from './content'

// The words of an issue of Glia Notes, shared by its email, its plain text and its archive page,
// so the three say the same. English only, like the windows (PLAN §12): the `gliaNotes` messages.

/** The `gliaNotes` messages in English. */
export const issueText = () =>
  createTranslator({ locale: 'en', messages: en, namespace: 'gliaNotes' })

export type IssueText = ReturnType<typeof issueText>

/** A calendar day as the issue writes it ("3 Nov 2026"). */
export const dayText = (day: string) => formatDay(day, 'en')

/**
 * A job's deadline: the day, and the time zone its day ends in (Anywhere on Earth when the
 * posting names none), or rolling, or until filled.
 */
export function deadlineText(job: IssueJob, t: IssueText): string {
  const { deadline } = job
  if (deadline.kind !== 'fixed')
    return t(deadline.kind === 'rolling' ? 'job.rolling' : 'job.untilFilled')
  const day = dayText(deadline.day)
  if (!deadline.timeZone) return t('job.deadlineAoe', { day })
  const end = deadlineEnd(deadline.day, deadline.timeZone)
  const { name, offset } = timeZoneLabel(deadline.timeZone, end.getTime() - 1, 'en')
  return t('job.deadlineZone', { day, zone: name ? `${name} (${offset})` : offset })
}

/** "Institution, City, Country", as far as known. */
export const jobPlace = (job: IssueJob) =>
  [job.institution, job.place].filter((part): part is string => Boolean(part)).join(', ')

/** "Postdoc · Deadline: …": the facts under a selected position's title. */
export const jobFacts = (job: IssueJob, t: IssueText) =>
  [job.positionType, deadlineText(job, t)].filter(Boolean).join(' · ')

/** The paragraphs of a text that separates them with blank lines (the opening note). */
export const paragraphsOf = (value: string) =>
  value
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
