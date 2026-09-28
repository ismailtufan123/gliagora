import type { Payload } from 'payload'

import type { EmailText } from '@/lib/email/messages'
import { canSendEmail } from '@/lib/email/settings'
import { errorCode, errorSummary } from '@/lib/errors'
import { CONTACT_EMAIL } from '@/lib/site'

// Sending one automatic email (M4.7) and knowing whether the mail server took it.

export type Delivery = 'sent' | 'refused' | 'unavailable'

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
 * Sends `message` to `to` through Payload's email adapter (payload.config.ts). Plain text, from
 * EMAIL_FROM, replies to hello@gliagora.com, marked as automatic so that out-of-office replies are
 * not sent back. Never call it when `canSendEmail()` is false. Logs only the error's class and
 * codes, never the address.
 */
export async function deliver(
  payload: Payload,
  to: string,
  message: EmailText,
  task: string,
): Promise<Delivery> {
  if (!canSendEmail()) return 'unavailable'
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
    if (accepted(result)) return 'sent'
    payload.logger.warn(`${task}: the mail server did not accept a message`)
    return 'refused'
  } catch (error) {
    const code = errorCode(error)
    payload.logger.warn(`${task}: a message was not sent (${errorSummary(error)})`)
    return code && TRANSPORT_ERRORS.has(code) ? 'unavailable' : 'refused'
  }
}
