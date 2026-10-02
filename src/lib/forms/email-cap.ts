// The site-wide cap on the emails the public forms send (D49; M2, D50): the sign-in links, the
// links to add an address and the data-request confirmations count against it together, and
// reaching it makes those forms say "temporarily unavailable". It protects the mailbox's sending
// limit and its reputation, so the server sets it from that limit (EMAIL_CAP_HOUR and
// EMAIL_CAP_DAY, deploy/.env.example), leaving room for what does not count here: the scheduled
// emails and the issues of Glia Notes. Read at request time: the image is built without the
// server's settings.

type Env = Record<string, string | undefined>

/** The cap without settings: 50 an hour, 200 a day (the last 23 hours at least, rate-limit.ts). */
export const EMAILS_SITE_WIDE = { hour: 50, day: 200 } as const

/** The largest value either setting takes; anything above is a typing error. */
export const EMAIL_CAP_MAX = 100_000

export type EmailCap = {
  hour: number
  day: number
  /** Whether a setting chose it (otherwise the default). */
  set: boolean
  /** One line for each setting not used as given, naming the variables, never their values. */
  problems: string[]
}

/** A setting: a usable number, `null` when empty, or `'unusable'` (with a problem). */
function read(env: Env, name: 'EMAIL_CAP_HOUR' | 'EMAIL_CAP_DAY', problems: string[]) {
  const text = env[name]?.trim()
  if (!text) return null
  const value = /^\d{1,6}$/.test(text) ? Number(text) : Number.NaN
  if (value >= 1 && value <= EMAIL_CAP_MAX) return value
  problems.push(
    `${name} is not a whole number from 1 to ${EMAIL_CAP_MAX}: the stricter of its default and the other setting is used.`,
  )
  return 'unusable' as const
}

/**
 * The cap from EMAIL_CAP_HOUR and EMAIL_CAP_DAY: each a whole number from 1 to EMAIL_CAP_MAX, or
 * empty for its default. It never raises a value the operator set, since the cap protects the
 * mailbox's limit:
 * - an empty hour is the default hour, or the day when that is lower (EMAIL_CAP_DAY=40 alone: 40
 *   an hour and 40 a day), with no problem;
 * - an hour above the day (or above the default day) is lowered to the day, with a problem;
 * - an unusable value is replaced by the stricter of its default and the other setting, with a
 *   problem (fail closed: a typing error never raises the cap).
 * Problems name the variables, never their values.
 */
export function emailCap(env: Env = process.env): EmailCap {
  const problems: string[] = []
  const hourIn = read(env, 'EMAIL_CAP_HOUR', problems)
  const dayIn = read(env, 'EMAIL_CAP_DAY', problems)
  const day =
    typeof dayIn === 'number'
      ? dayIn
      : dayIn === 'unusable' && typeof hourIn === 'number'
        ? Math.min(EMAILS_SITE_WIDE.day, hourIn)
        : EMAILS_SITE_WIDE.day
  let hour = Math.min(EMAILS_SITE_WIDE.hour, day)
  if (typeof hourIn === 'number') {
    hour = Math.min(hourIn, day)
    // An unusable day already said which value is used.
    if (hourIn > day && dayIn !== 'unusable') {
      problems.push(
        dayIn === null
          ? 'EMAIL_CAP_HOUR is above the default of EMAIL_CAP_DAY: the hour is limited to the day.'
          : 'EMAIL_CAP_HOUR is above EMAIL_CAP_DAY: the hour is limited to the day.',
      )
    }
  }
  return {
    hour,
    day,
    set: typeof hourIn === 'number' || typeof dayIn === 'number',
    problems,
  }
}

/** The start line: the cap in force, and whether it is the default. */
export function describeEmailCap(cap: EmailCap): string {
  return `Email cap of the forms: ${cap.hour} an hour, ${cap.day} a day${cap.set ? '' : ' (default)'}`
}
