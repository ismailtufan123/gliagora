import { EMAIL_MAX } from '@/lib/forms/fields'
import { emailProblem } from '@/lib/forms/text'

// Email addresses of members and of the forms that send an email (M4b, D49). An address is stored
// in one form only (trimmed, NFC, lowercased; the database refuses an uppercase one, src/
// migrations/20261001_142246_member_constraints.ts), so a lookup never depends on how it was typed.
// Suggestions and reports keep the address as typed, so code that matches them compares
// `lower(email)` in SQL.

/** The longest address that can be delivered (RFC 5321). */
export const MEMBER_EMAIL_MAX = EMAIL_MAX

/**
 * The stored form of an address: trimmed, Unicode NFC, lowercased; null if it is not an address
 * the public forms (and Payload's email fields) accept, or longer than 254 characters.
 */
export function normaliseEmail(value: string): string | null {
  const email = value.trim().normalize('NFC').toLowerCase()
  if (email === '' || emailProblem(email) !== null) return null
  return email
}

/** Providers where dots in the local part do not matter and either domain reaches one mailbox. */
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/**
 * The canonical form of an address for the limits of the forms that send an email (the M4b
 * design §8): lowercased, without a `+tag` in the local part, and for Gmail without dots and
 * written `gmail.com`. Variants that reach the same mailbox then share one budget. Only for
 * counting: an email goes to the address in its stored form (normaliseEmail), never to this
 * counting form.
 */
export function limitAddress(email: string): string {
  const value = email.trim().normalize('NFC').toLowerCase()
  const at = value.lastIndexOf('@')
  if (at <= 0) return value
  let local = value.slice(0, at)
  let domain = value.slice(at + 1)
  const plus = local.indexOf('+')
  // "+tag@…" alone has no mailbox name to keep, so it stays as it is.
  if (plus > 0) local = local.slice(0, plus)
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replaceAll('.', '') || local
    domain = 'gmail.com'
  }
  return `${local}@${domain}`
}
