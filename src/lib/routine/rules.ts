import { deadlineEnd } from '@/lib/jobs/deadline'
import { isTimeZone } from '@/lib/jobs/time-zones'
import { ageInDays, isPlaceholderDeadline } from '@/lib/monitors/dates'
import { inCaselessScript, redact } from '@/lib/redaction/redact'
import { NOT_RESEARCH_LABELS, type NotResearchKind } from '@/lib/tags/research'

// The written rules of "Update the jobs" (D59, docs/update-jobs.md) that the server checks itself
// before a job is published, whatever the decision says: Claude Code decides each candidate, and
// these rules stand behind its "publish". A problem is `hard` when not even the operator's own
// word ("publish this one") sets it aside: a person's name, an email address, a phone number or a
// web address in what the site would show, text in a script whose names redaction cannot find, a
// deadline that has passed or is a placeholder, no deadline at all, no institution, a shared
// board's site not named. The others are judgements the operator may take on, each by its name
// (`WAIVABLE`): a post the title check reads as not research, a deadline closer than three days, an
// open-ended post without a recent publication day, and at the last look a redirect or a page that
// names another (open) deadline.

/** The judgements the operator's word may set aside, each by name. */
export const WAIVABLE = [
  'not-research',
  'deadline-soon',
  'open-ended-age',
  'redirect',
  'page-deadline',
] as const

export type Waivable = (typeof WAIVABLE)[number]

/** A fixed deadline must be at least this far ahead (D59). */
export const MIN_DAYS_LEFT = 3

/** An open-ended post must have been published within this many days (D59). */
export const OPEN_ENDED_RECENT_DAYS = 60

export type DeadlineFact = {
  kind: 'fixed' | 'rolling' | 'until-filled'
  date: string | null
  timeZone: string | null
}

export type PublishFacts = {
  /** The job's title: the candidate's title as stored (redacted). */
  title: string
  summary: string
  startText?: string | null
  /** The city a decision gives, shown with the job. */
  city?: string | null
  deadline: DeadlineFact | null
  /** The institution's time zone, where a fixed deadline ends unless the posting names another. */
  institutionTimeZone: string | null
  /** The day the employer published the posting (the monitor's facts), if known. */
  published: string | null
  hasInstitution: boolean
  /** The source's postings are at several sites (the Max Planck Society, VIB, HHMI, DZNE). */
  severalSites: boolean
  /** The decision names the institution where the work happens. */
  institutionChosen: boolean
  notResearch: { kind: NotResearchKind; words: string } | null
}

export type Problem = { rule: string; message: string; hard: boolean }

const PLACEHOLDERS = /\[(?:name|email|phone|link)\]/

/** Why `text`, which the site would show, may not be published: it names a person or a contact. */
export function personalDetails(text: string | null | undefined): string | null {
  if (!text) return null
  if (PLACEHOLDERS.test(text)) {
    return 'it holds a placeholder where the posting named a person or a contact'
  }
  if (inCaselessScript(text)) {
    return 'it is written partly in a script whose names redaction cannot find'
  }
  const { counts } = redact(text)
  if (counts.name > 0) return 'it names a person'
  if (counts.email > 0) return 'it gives an email address'
  if (counts.phone > 0) return 'it gives a phone number'
  if (counts.link > 0) return 'it gives a web address'
  return null
}

/** The end of a fixed deadline's day, in the posting's time zone or else the institution's. */
export function endOf(
  day: string,
  timeZone: string | null,
  institutionTimeZone: string | null,
): Date {
  const zone = timeZone ?? institutionTimeZone
  return deadlineEnd(day, zone && isTimeZone(zone) ? zone : null)
}

/** The problems that stop a job made of `facts` from being published `now`. */
export function publishProblems(facts: PublishFacts, now: Date): Problem[] {
  const problems: Problem[] = []
  const add = (rule: string, message: string, hard: boolean) =>
    problems.push({ rule, message, hard })

  for (const [field, value] of [
    ['title', facts.title],
    ['summary', facts.summary],
    ['start', facts.startText],
    ['city', facts.city],
  ] as const) {
    const why = personalDetails(value)
    if (why) add('no-personal-details', `The ${field} cannot be published: ${why}.`, true)
  }
  if (!facts.summary.trim()) add('summary', 'There is no summary.', true)
  if (facts.summary.length > 280) add('summary', 'The summary is longer than 280 characters.', true)
  if (!facts.hasInstitution) add('institution', 'The candidate has no institution.', true)
  if (facts.severalSites && !facts.institutionChosen) {
    add(
      'institution',
      'The source posts for several sites: name the institution where the work happens.',
      true,
    )
  }
  if (facts.notResearch) {
    add(
      'not-research',
      `The title reads as ${NOT_RESEARCH_LABELS[facts.notResearch.kind]} ("${facts.notResearch.words}").`,
      false,
    )
  }

  const deadline = facts.deadline
  const open = deadline?.kind === 'rolling' ? 'rolling' : 'open until filled'
  if (!deadline) {
    add(
      'deadline-missing',
      'Neither a deadline nor "rolling" or "until filled" is known: give one.',
      true,
    )
  } else if (deadline.kind === 'fixed') {
    if (!deadline.date) {
      add('deadline-missing', 'A fixed deadline needs its day.', true)
    } else if (isPlaceholderDeadline(deadline.date, now)) {
      add(
        'deadline-placeholder',
        `${deadline.date} is a placeholder: decide "rolling" instead.`,
        true,
      )
    } else {
      const end = endOf(deadline.date, deadline.timeZone, facts.institutionTimeZone)
      const left = end.getTime() - now.getTime()
      if (left <= 0) add('deadline-passed', `The deadline, ${deadline.date}, has passed.`, true)
      else if (left < MIN_DAYS_LEFT * 86_400_000) {
        add(
          'deadline-soon',
          `The deadline, ${deadline.date}, is less than ${MIN_DAYS_LEFT} days away.`,
          false,
        )
      }
    }
  } else if (!facts.published) {
    add('open-ended-age', `It is ${open}, and the day it was published is not known.`, false)
  } else if (ageInDays(facts.published, now) > OPEN_ENDED_RECENT_DAYS) {
    add(
      'open-ended-age',
      `It is ${open} and was published on ${facts.published}, over ${OPEN_ENDED_RECENT_DAYS} days ago.`,
      false,
    )
  }
  return problems
}

/** The problems that remain once the operator's word has set aside the judgements it names. */
export function blocking(problems: Problem[], waived: readonly string[] = []): Problem[] {
  return problems.filter((problem) => problem.hard || !waived.includes(problem.rule))
}
