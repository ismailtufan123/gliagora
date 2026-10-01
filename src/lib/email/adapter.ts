import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import type { EmailAdapter } from 'payload'

import { errorCode } from '@/lib/errors'

import { type SmtpCommand, enhancedStatus, smtpCommand } from './deliver'
import { type Address, DEFAULT_SENDER, smtpSettings } from './settings'

/**
 * A send error without the recipient or the server's reply: only the codes that `sendOne()`
 * (src/lib/email/deliver.ts) and `errorSummary()` (src/lib/errors.ts) read. `enhanced` is the
 * reply's enhanced status code (RFC 3463, e.g. `5.1.1` for an address that does not exist), the
 * only part of the reply's text that is kept: the rest names the recipient. `command` is the SMTP
 * command the server refused (`MAIL FROM`: the sender; `RCPT TO`: the recipient; `DATA`: the
 * message), as Nodemailer reports it; it names nobody.
 */
export class EmailNotSentError extends Error {
  override name = 'EmailNotSentError'
  readonly code?: string
  readonly responseCode?: number
  readonly enhanced?: string
  readonly command?: SmtpCommand

  constructor(code?: string, responseCode?: number, enhanced?: string, command?: SmtpCommand) {
    super(`An email was not sent (${[code, responseCode].filter(Boolean).join(' ') || 'unknown'})`)
    this.code = code
    this.responseCode = responseCode
    this.enhanced = enhanced
    this.command = command
  }
}

/**
 * Replaces every send error with an `EmailNotSentError`. Nodemailer's errors name the refused
 * recipients (`rejected`, `rejectedErrors`) and quote the server's reply, and Payload logs its own
 * failed emails (a new admin password) whole. The original is not kept as `cause`: the logger
 * would print its message too.
 */
export function withoutRecipients(adapter: EmailAdapter): EmailAdapter {
  return (args) => {
    const inner = adapter(args)
    return {
      ...inner,
      sendEmail: async (message) => {
        try {
          return await inner.sendEmail(message)
        } catch (error) {
          const { responseCode, response, command } =
            (error as { responseCode?: unknown; response?: unknown; command?: unknown } | null) ??
            {}
          throw new EmailNotSentError(
            errorCode(error),
            typeof responseCode === 'number' ? responseCode : undefined,
            enhancedStatus(response),
            smtpCommand(command),
          )
        }
      },
    }
  }
}

/**
 * Stands in for a mail server when SMTP_HOST is not set (local development, CI, and production
 * until the Turkish mailbox is set up at M2). It sends nothing and logs one line without the
 * recipient or the subject. Payload's own fallback would write each recipient's address to the log instead, for
 * example an editor's address when someone asks for a new admin password: Payload then answers as
 * if the email had been sent, and no email arrives (the operator resets passwords by hand).
 */
export function noEmailAdapter(from: Address = DEFAULT_SENDER): EmailAdapter {
  return ({ payload }) => ({
    name: 'none',
    defaultFromAddress: from.address,
    defaultFromName: from.name,
    sendEmail: async () => {
      payload.logger.warn('An email was not sent: no mail server is set up (SMTP_HOST).')
    },
  })
}

/**
 * The email adapter for payload.config.ts: Nodemailer through the SMTP server in SMTP_HOST, with
 * errors that name no recipient (`withoutRecipients`), or `noEmailAdapter` without one. Never
 * Nodemailer without a server: it would then create a test account at an outside service
 * (ethereal.email) and send the messages there.
 */
export function emailAdapter(
  env: Record<string, string | undefined> = process.env,
): EmailAdapter | Promise<EmailAdapter> {
  const settings = smtpSettings(env)
  if (!settings) return noEmailAdapter()
  return nodemailerAdapter({
    defaultFromAddress: settings.from.address,
    defaultFromName: settings.from.name,
    // Checking the server would connect to it whenever the config is loaded (every CLI command
    // and build); the first message shows any problem instead, in the task's log.
    skipVerify: true,
    transportOptions: {
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: settings.requireTLS,
      ...(settings.auth ? { auth: settings.auth } : {}),
      // Fail fast so a task does not wait minutes for a server that does not answer.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
      // No transcript of the SMTP session: it would contain the recipients.
      logger: false,
      debug: false,
    },
  }).then(withoutRecipients)
}
