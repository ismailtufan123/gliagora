import { canSendEmail, parseAddress } from '@/lib/email/settings'
import { emailCap } from '@/lib/forms/email-cap'

import { type ListmonkSettings, campaignsSettings } from '../config'

// The settings of the newsletter builder (M11, D53), read per request: the image is built without
// the server's settings. Each problem names the variable, never its value.

type Env = Record<string, string | undefined>

/** The most seed addresses a test email goes to besides the editor (PLAN §13). */
export const SEED_ADDRESSES_MAX = 10

/**
 * The seed addresses every test email also goes to (GLIA_NOTES_SEED_ADDRESSES, PLAN §13: Gmail,
 * Outlook, Yahoo and a Turkish provider, to see how each shows the issue), separated by commas or
 * spaces, lowercased and without repeats; unusable entries and those beyond SEED_ADDRESSES_MAX
 * are left out with a problem. The operator's own test accounts, never subscribers.
 */
export function seedAddresses(env: Env = process.env): { addresses: string[]; problems: string[] } {
  const problems: string[] = []
  const addresses: string[] = []
  for (const entry of (env.GLIA_NOTES_SEED_ADDRESSES ?? '').split(/[\s,]+/).filter(Boolean)) {
    const parsed = parseAddress(entry)
    if (!parsed || parsed.address !== entry) {
      problems.push(
        'GLIA_NOTES_SEED_ADDRESSES has an entry that is not an email address; it is left out.',
      )
      continue
    }
    const address = parsed.address.toLowerCase()
    if (addresses.includes(address)) continue
    if (addresses.length >= SEED_ADDRESSES_MAX) {
      problems.push(
        `GLIA_NOTES_SEED_ADDRESSES has more than ${SEED_ADDRESSES_MAX} addresses; the rest are left out.`,
      )
      break
    }
    addresses.push(address)
  }
  return { addresses, problems }
}

/** The most a mailbox limit may be (settings.sql takes the same). */
export const MAILBOX_LIMIT_MAX = 9_999_999

/** A mailbox limit: a whole number from 1, empty (null), or unusable. */
function limit(env: Env, name: 'MAILBOX_LIMIT_HOUR' | 'MAILBOX_LIMIT_DAY') {
  const text = env[name]?.trim() ?? ''
  if (text === '') return null
  return /^[1-9]\d{0,6}$/.test(text) ? Number(text) : ('unusable' as const)
}

/** listmonk's sending rate for the issues: at most `rate` messages per window of `windowHours`. */
export type SendRate = { rate: number; windowHours: number }

/**
 * The issues' sending rate from the mailbox's limits, as deploy/listmonk/settings.sql computes it
 * for listmonk (a database test checks that the two agree): of each limit, a tenth stays for the
 * scheduled emails and anything sent by hand, and the forms' email cap twice (their links, and as
 * many welcome emails again); the rest is the issues' share. Per hour that share each hour; with a
 * daily limit, a window long enough that the windows of one day stay within the day's share.
 * Null without limits; a problem when a limit leaves no share.
 */
export function sendRate(limits: {
  mailboxHour: number | null
  mailboxDay: number | null
  capHour: number
  capDay: number
}): SendRate | { problem: string } | null {
  const { mailboxHour, mailboxDay, capHour, capDay } = limits
  const hour = mailboxHour === null ? null : Math.floor(mailboxHour * 0.9) - 2 * capHour
  const day = mailboxDay === null ? null : Math.floor(mailboxDay * 0.9) - 2 * capDay
  if (hour === null && day === null) return null
  if ((hour !== null && hour < 1) || (day !== null && day < 1)) {
    return {
      problem:
        "The mailbox's sending limit leaves no room for Glia Notes after the forms' email cap: lower EMAIL_CAP_* or check MAILBOX_LIMIT_*.",
    }
  }
  if (day === null) return { rate: hour!, windowHours: 1 }
  if (hour === null) return { rate: day, windowHours: 24 }
  const rate = Math.min(hour, day)
  return { rate, windowHours: Math.ceil(24 / Math.floor(day / rate)) }
}

/** Whether, and how, issues can be pushed to listmonk now (D53). */
export type PushSettings =
  | { on: true; listmonk: ListmonkSettings; rate: SendRate; canSchedule: boolean }
  | { on: false; reason: string; code: 'switch' | 'listmonk' | 'limit' | 'room' }

/**
 * The push's settings, read per request: GLIA_NOTES_PUSH=on (the operator switches it on at the
 * launch, D53; anything else keeps it off), the issues' API user (campaignsSettings) and the
 * mailbox's limits (MAILBOX_LIMIT_HOUR and/or MAILBOX_LIMIT_DAY, from M2's mailbox). Scheduling
 * also needs a mail server (SMTP_HOST, which listmonk is given too).
 */
export function pushSettings(env: Env = process.env): PushSettings {
  if (env.GLIA_NOTES_PUSH?.trim().toLowerCase() !== 'on') {
    return {
      on: false,
      code: 'switch',
      reason:
        'Pushing issues to listmonk is switched off until the launch (GLIA_NOTES_PUSH, D53). Use the preview and the test email until then.',
    }
  }
  const listmonk = campaignsSettings(env)
  if (!listmonk) {
    return {
      on: false,
      code: 'listmonk',
      reason:
        "Pushing is on, but the issues' listmonk user is not set up (LISTMONK_URL and LISTMONK_CAMPAIGNS_TOKEN).",
    }
  }
  const hour = limit(env, 'MAILBOX_LIMIT_HOUR')
  const day = limit(env, 'MAILBOX_LIMIT_DAY')
  if (hour === 'unusable' || day === 'unusable') {
    return {
      on: false,
      code: 'limit',
      reason: `MAILBOX_LIMIT_HOUR and MAILBOX_LIMIT_DAY must be whole numbers from 1 to ${MAILBOX_LIMIT_MAX}.`,
    }
  }
  const cap = emailCap(env)
  // listmonk's settings refuse a cap the app would only correct (deploy/listmonk/settings.sql), so
  // listmonk would keep its own rate: no push until the cap reads cleanly.
  if (cap.problems.length > 0) {
    return {
      on: false,
      code: 'limit',
      reason:
        "EMAIL_CAP_HOUR or EMAIL_CAP_DAY needs correcting (the app's start line says which): correct it first, so that listmonk gets the sending rate the app expects.",
    }
  }
  const rate = sendRate({ mailboxHour: hour, mailboxDay: day, capHour: cap.hour, capDay: cap.day })
  if (!rate) {
    return {
      on: false,
      code: 'limit',
      reason:
        "Set the mailbox's sending limit first (MAILBOX_LIMIT_HOUR and/or MAILBOX_LIMIT_DAY).",
    }
  }
  if ('problem' in rate) return { on: false, code: 'room', reason: rate.problem }
  return { on: true, listmonk, rate, canSchedule: canSendEmail(env) }
}

const OFF: Record<Extract<PushSettings, { on: false }>['code'], string> = {
  switch: 'GLIA_NOTES_PUSH, until the launch',
  listmonk: 'no listmonk user for the issues',
  limit: 'no usable mailbox limit',
  room: "the mailbox limit leaves no room after the forms' cap",
}

/** "25 messages an hour" or "400 messages every 12 hours". */
export const rateText = ({ rate, windowHours }: SendRate) =>
  `${rate} message${rate === 1 ? '' : 's'} ${windowHours === 1 ? 'an hour' : `every ${windowHours} hours`}`

/** The start line: whether issues can be pushed, and at which rate; never a value of a secret. */
export function describeIssuePush(settings: PushSettings = pushSettings()): string {
  return settings.on
    ? `Glia Notes issues: push on, at most ${rateText(settings.rate)}${settings.canSchedule ? '' : ' (no mail server: drafts only)'}`
    : `Glia Notes issues: push off (${OFF[settings.code]})`
}
