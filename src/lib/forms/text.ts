import { EMAIL_MAX } from './fields'

// Plain-text and email checks shared by the public forms ("Suggest a listing", "Report a
// problem"). Server side only: the browser sends text, and every message comes from the server.

// Control characters (C0 except tab and line feed, DEL, C1) and the invisible characters that
// reorder text (bidirectional overrides and isolates), which could make a text look different in
// the admin than what was sent.
const UNWANTED = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g

/**
 * A text field as plain text: line breaks as "\n" (browsers send them as "\r\n", but count them
 * as one character), without control characters, trimmed.
 */
export function cleanText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(UNWANTED, '').trim()
}

/**
 * The email check of Payload's email fields (payload/dist/fields/validations.js), so that nothing
 * passes here that the collections would refuse: no spaces or quotes, no double dots, a domain
 * with a top-level domain of two or more letters.
 */
const EMAIL =
  /^(?!.*\.\.)[\w!#$%&'*+/=?^`{|}~-](?:[\w!#$%&'*+/=?^`{|}~.-]*[\w!#$%&'*+/=?^`{|}~-])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

/** Why an email address (already trimmed) cannot be stored, or null; an empty one is fine here. */
export function emailProblem(value: string): 'emailTooLong' | 'emailInvalid' | null {
  if (value.length > EMAIL_MAX) return 'emailTooLong'
  if (value !== '' && !EMAIL.test(value)) return 'emailInvalid'
  return null
}
