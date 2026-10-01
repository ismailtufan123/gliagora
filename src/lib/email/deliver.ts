import type { Payload } from 'payload'

import { errorCode, errorSummary } from '@/lib/errors'
import { CONTACT_EMAIL } from '@/lib/site'

import type { EmailText } from './messages'
import { canSendEmail } from './settings'

// Sending one automatic email (M4.7, M4b) and knowing what the mail server answered. `deliver()`
// is what the email tasks use; `sendOne()` also reports the server's reply code and enhanced status
// (never the reply's text, which names the recipient), for the cases that must tell an address
// that does not exist (5.1.x) from a full mailbox, a policy refusal or a server asking to try again
// later (4xx): the inactivity warnings (the M4b design §7.7). `deliverWhileWaiting()` is for the
// forms that email a link while the person waits for the page, with an overall time limit.

export type Delivery = 'sent' | 'refused' | 'unavailable'

/** The SMTP reply: its code (250, 450, 550 …) and enhanced status (RFC 3463, `5.1.1`), if any. */
export type SmtpReply = { code: number; enhanced?: string }

export type SendResult = {
  status: Delivery
  reply?: SmtpReply
  /** The error's class and codes (`errorSummary`) when sending threw; no personal data. */
  error?: string
}

/**
 * Transport problems that will hit every message of this run: the task stops and the next run
 * tries again. Anything else (a recipient the server refused) is about one message.
 */
const TRANSPORT_ERRORS = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ETLS',
  'EAUTH',
  'ENOAUTH',
  'EPROTOCOL',
  'ECONNREFUSED',
  'ECONNRESET',
])

/** Whether the server accepted the message for its one recipient (Nodemailer's result). */
export function accepted(result: unknown): boolean {
  const info = result as { accepted?: unknown[]; rejected?: unknown[] } | null | undefined
  return (info?.accepted?.length ?? 0) > 0 && (info?.rejected?.length ?? 0) === 0
}

/**
 * The enhanced status code at the start of an SMTP reply (`550 5.1.1 <…>: …` gives `5.1.1`), or
 * undefined. Digits and dots only, so nothing of the reply's text is kept.
 */
export function enhancedStatus(response: unknown): string | undefined {
  if (typeof response !== 'string') return undefined
  return /^\d{3}[ -]([245]\.\d{1,3}\.\d{1,3})(?=\s|$)/.exec(response)?.[1]
}

/** The reply code and enhanced status of a result or an error, if they are known. */
function replyOf(value: unknown): SmtpReply | undefined {
  const fields = (value ?? {}) as { responseCode?: unknown; response?: unknown; enhanced?: unknown }
  const fromText = typeof fields.response === 'string' ? /^(\d{3})\b/.exec(fields.response) : null
  const code =
    typeof fields.responseCode === 'number' ? fields.responseCode : Number(fromText?.[1] ?? NaN)
  if (!Number.isInteger(code)) return undefined
  const enhanced =
    typeof fields.enhanced === 'string' ? fields.enhanced : enhancedStatus(fields.response)
  return enhanced ? { code, enhanced } : { code }
}

/**
 * Sends `message` to `to` through Payload's email adapter (payload.config.ts) and says what
 * happened: plain text, from EMAIL_FROM, replies to hello@gliagora.com, marked as automatic so
 * that out-of-office replies are not sent back. `unavailable` without a mail server (SMTP_HOST) or
 * when the server cannot be reached; `refused` when it did not take the message. Logs nothing.
 */
export async function sendOne(
  payload: Payload,
  to: string,
  message: EmailText,
): Promise<SendResult> {
  if (!canSendEmail()) return { status: 'unavailable' }
  try {
    // The sender is the adapter's default, EMAIL_FROM (src/lib/email/adapter.ts).
    const result = await payload.sendEmail({
      to,
      replyTo: CONTACT_EMAIL,
      subject: message.subject,
      text: message.text,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        'Content-Language': message.locale,
      },
    })
    if (accepted(result)) return { status: 'sent', reply: replyOf(result) }
    // A recipient refused without an error (Nodemailer does so when some of several are taken).
    const refusal = (result as { rejectedErrors?: unknown[] } | null)?.rejectedErrors?.[0]
    return { status: 'refused', reply: replyOf(refusal) }
  } catch (error) {
    const code = errorCode(error)
    return {
      status: code && TRANSPORT_ERRORS.has(code) ? 'unavailable' : 'refused',
      reply: replyOf(error),
      error: errorSummary(error),
    }
  }
}

/** Logs a message that was not sent, with the error's class and codes only, never the address. */
function logResult(payload: Payload, task: string, result: SendResult) {
  if (result.error) {
    payload.logger.warn(`${task}: a message was not sent (${result.error})`)
  } else if (result.status === 'refused') {
    payload.logger.warn(`${task}: the mail server did not accept a message`)
  }
}

/**
 * Sends one automatic email (see `sendOne`) for the task named `task`, and logs a failure with the
 * error's class and codes only, never the address. Never call it when `canSendEmail()` is false.
 */
export async function deliver(
  payload: Payload,
  to: string,
  message: EmailText,
  task: string,
): Promise<Delivery> {
  const result = await sendOne(payload, to, message)
  logResult(payload, task, result)
  return result.status
}

/**
 * The longest a person waits for an email sent while the page waits for it (a sign-in link; the
 * M4b design §9). The adapter alone may take 15 seconds to connect and 60 seconds per reply
 * (src/lib/email/adapter.ts), which suits a task but not a person looking at a page.
 */
export const WAIT_FOR_SEND_MS = 20_000

/**
 * Sends one email while a person waits for the page (`deliver`, with an overall time limit). A
 * send that takes longer counts as `unavailable`: the form then says it could not send the email,
 * and the caller removes the link the email would have carried, so a message that still arrives
 * later leads to "This link has expired".
 */
export async function deliverWhileWaiting(
  payload: Payload,
  to: string,
  message: EmailText,
  task: string,
  limitMs: number = WAIT_FOR_SEND_MS,
): Promise<Delivery> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<SendResult>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'unavailable', error: 'Timeout' }), limitMs)
  })
  try {
    const result = await Promise.race([sendOne(payload, to, message), timeout])
    logResult(payload, task, result)
    return result.status
  } finally {
    clearTimeout(timer)
  }
}
