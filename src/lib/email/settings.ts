import { CONTACT_EMAIL } from '@/lib/site'

// Outgoing email (M4.7): the outcome of a suggestion and the automatic acknowledgement of a report.
// Sent through an SMTP server named by SMTP_HOST: in production the SMTP server of the Turkish
// mailbox set up at M2 (no separate relay at the start, PLAN §11.7.1, D22); Mailpit locally
// (compose.yaml, profile "mail"), which keeps every message on this computer. Without SMTP_HOST
// nothing is sent (src/lib/email/adapter.ts).

export type Address = { name: string; address: string }

export type SmtpSettings = {
  host: string
  port: number
  /** TLS from the start (port 465). Otherwise STARTTLS, required except on this computer. */
  secure: boolean
  requireTLS: boolean
  auth: { user: string; pass: string } | null
  from: Address
}

type Env = Record<string, string | undefined>

/** The sender when EMAIL_FROM is not set: our general address, which also takes the replies. */
export const DEFAULT_SENDER: Address = { name: 'Gliagora', address: CONTACT_EMAIL }

// A deliberately plain check: one @, no spaces or angle brackets. The mail server checks the rest.
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Reads "Name <address>" or a bare address; null when it is neither. */
export function parseAddress(value: string): Address | null {
  const text = value.trim()
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(text)
  const name = (named?.[1] ?? '').trim().replace(/^"(.*)"$/, '$1')
  const address = (named ? (named[2] ?? '') : text).trim()
  if (!ADDRESS.test(address)) return null
  return { name: name || DEFAULT_SENDER.name, address }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * The SMTP server to send through, from the environment, or null when SMTP_HOST is not set: then
 * nothing is sent. Unusable values fall back to the defaults, with a warning that names the
 * variable, never its value (SMTP_PASS is a secret).
 */
export function smtpSettings(
  env: Env = process.env,
  warn: (message: string) => void = console.warn,
): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim()
  if (!host) return null
  const secure = env.SMTP_SECURE?.trim().toLowerCase() === 'true'
  const defaultPort = secure ? 465 : 587
  let port = defaultPort
  if (env.SMTP_PORT?.trim()) {
    const parsed = Number(env.SMTP_PORT.trim())
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65_536) port = parsed
    else warn(`SMTP_PORT is not a port number; using ${defaultPort}.`)
  }
  let from = DEFAULT_SENDER
  if (env.EMAIL_FROM?.trim()) {
    const parsed = parseAddress(env.EMAIL_FROM)
    if (parsed) from = parsed
    else warn(`EMAIL_FROM is not an email address; sending from ${DEFAULT_SENDER.address}.`)
  }
  const user = env.SMTP_USER?.trim()
  return {
    host,
    port,
    secure,
    // Never in clear text over the network: a server that does not offer STARTTLS is refused.
    // Mailpit on this computer has no TLS.
    requireTLS: !secure && !LOOPBACK.has(host.toLowerCase()),
    auth: user ? { user, pass: env.SMTP_PASS ?? '' } : null,
    from,
  }
}

/**
 * Whether email can be sent. The tasks that send email check this first and otherwise do nothing,
 * so no message, and no address, ever goes to the console instead.
 */
export const canSendEmail = (env: Env = process.env) => Boolean(env.SMTP_HOST?.trim())
