// The source register (PLAN §5.1 `Source`, §6.1, D52): where positions come from, and how. A
// monitor reads `rss`, `api` and `page` sources by itself, at most once a day; an editor checks
// `manual` ones, which the dashboard shows when they are due for a look.

export const SOURCE_KINDS = [
  { value: 'rss', label: 'RSS or Atom feed' },
  { value: 'api', label: 'Documented API' },
  { value: 'page', label: 'Vacancy list page (plain HTML)' },
  { value: 'manual', label: 'Checked by an editor' },
] as const

export type SourceKind = (typeof SOURCE_KINDS)[number]['value']

/** The kinds a monitor reads by itself. */
export const AUTOMATIC_KINDS: readonly SourceKind[] = ['rss', 'api', 'page']

export const isAutomatic = (kind: unknown) => AUTOMATIC_KINDS.includes(kind as SourceKind)

/** The documented job-board APIs of the employers' own career sites that a monitor can read. */
export const API_FORMATS = [
  { value: 'greenhouse', label: 'Greenhouse Job Board API' },
  { value: 'lever', label: 'Lever Postings API' },
  { value: 'smartrecruiters', label: 'SmartRecruiters Posting API' },
] as const

export type ApiFormat = (typeof API_FORMATS)[number]['value']

/** What a source's terms of use say about automated access (D52). */
export const TERMS_AUTOMATION = [
  { value: 'not-stated', label: 'Terms found; nothing on automated access' },
  { value: 'allows', label: 'Terms allow automated access' },
  { value: 'forbids', label: 'Terms forbid automated access (the source stays manual)' },
  { value: 'not-found', label: 'No terms of use found' },
] as const

export type TermsAutomation = (typeof TERMS_AUTOMATION)[number]['value']

/** How often a source is read: by the monitor, or by an editor for a manual source. */
export const SOURCE_SCHEDULES = [
  { value: 'daily', label: 'Daily', days: 1 },
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'monthly', label: 'Monthly', days: 30 },
] as const

export type SourceSchedule = (typeof SOURCE_SCHEDULES)[number]['value']

export const scheduleDays = (schedule: unknown): number =>
  SOURCE_SCHEDULES.find((option) => option.value === schedule)?.days ?? 1

/** A monitor run that fails this many times in a row flags the source for the editor (D52). */
export const FAILURES_FLAGGED = 3

/** What happened to a posting a monitor saw (`source-postings`). */
export const POSTING_OUTCOMES = [
  { value: 'candidate', label: 'Made a candidate' },
  { value: 'not-neuroscience', label: 'Skipped: not neuroscience' },
  { value: 'closed', label: 'Skipped: its deadline has passed' },
  { value: 'duplicate', label: 'Skipped: already a candidate or a job' },
] as const

export type PostingOutcome = (typeof POSTING_OUTCOMES)[number]['value']

/**
 * Why `pattern` cannot be the regular expression of a source's posting addresses, or null. It
 * must compile, start with `^` and end with `$`, so that it names whole addresses.
 */
export function postingPatternProblem(pattern: string): string | null {
  const trimmed = pattern.trim()
  if (!trimmed.startsWith('^') || !trimmed.endsWith('$')) {
    return 'Start the pattern with ^ and end it with $, so that it matches whole addresses.'
  }
  try {
    new RegExp(trimmed, 'u')
  } catch {
    return 'This is not a valid regular expression.'
  }
  return null
}
