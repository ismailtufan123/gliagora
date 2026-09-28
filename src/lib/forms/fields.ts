// Names and limits of the "Suggest a listing" form, shared by the server (suggest-schema.ts) and
// the form in the browser (src/components/suggest/SuggestForm.tsx). Kept apart from the schema so
// that the browser does not load zod.

/** The fields a person fills in, in the order of the form (and of the error summary). */
export const SUGGEST_FIELDS = ['url', 'kind', 'note', 'email', 'consent'] as const
export type SuggestField = (typeof SUGGEST_FIELDS)[number]

/** Names of the other inputs the form sends. */
export const SUGGEST_INPUTS = {
  /** The spam check's answer (base64), written by the solver in the browser. */
  altcha: 'altcha',
  /**
   * The hidden field for spam programs. A name that browsers do not fill in automatically (not
   * "name", "email", "website" …), so a person's autofill never trips it.
   */
  honeypot: 'reference_code',
  locale: 'locale',
} as const

/** The longest note, in UTF-16 code units: what the browser counts, and what Payload checks. */
export const NOTE_MAX = 500
/** The longest email address that can be delivered (RFC 5321). */
export const EMAIL_MAX = 254
