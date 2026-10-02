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
  /** One line for each unusable setting, naming the variable, never its value. */
  problems: string[]
}

function read(env: Env, name: 'EMAIL_CAP_HOUR' | 'EMAIL_CAP_DAY', problems: string[]) {
  const text = env[name]?.trim()
  if (!text) return null
  const value = /^\d{1,6}$/.test(text) ? Number(text) : Number.NaN
  if (value >= 1 && value <= EMAIL_CAP_MAX) return value
  problems.push(`${name} is not a whole number from 1 to ${EMAIL_CAP_MAX}: it is not used.`)
  return null
}

/**
 * The cap from EMAIL_CAP_HOUR and EMAIL_CAP_DAY: each a whole number from 1 to EMAIL_CAP_MAX, or
 * empty for its default. An unusable one keeps its default, with a problem; an hour above the day
 * keeps both defaults, since one of them is a mistake.
 */
export function emailCap(env: Env = process.env): EmailCap {
  const problems: string[] = []
  const hour = read(env, 'EMAIL_CAP_HOUR', problems)
  const day = read(env, 'EMAIL_CAP_DAY', problems)
  const cap = { hour: hour ?? EMAILS_SITE_WIDE.hour, day: day ?? EMAILS_SITE_WIDE.day }
  if (cap.hour > cap.day) {
    problems.push(
      `EMAIL_CAP_HOUR is above EMAIL_CAP_DAY: both are not used (${EMAILS_SITE_WIDE.hour} an hour, ${EMAILS_SITE_WIDE.day} a day).`,
    )
    return { ...EMAILS_SITE_WIDE, set: false, problems }
  }
  return { ...cap, set: hour !== null || day !== null, problems }
}

/** The start line: the cap in force, and whether it is the default. */
export function describeEmailCap(cap: EmailCap): string {
  return `Email cap of the forms: ${cap.hour} an hour, ${cap.day} a day${cap.set ? '' : ' (default)'}`
}
