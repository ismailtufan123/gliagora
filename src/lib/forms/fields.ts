// Names and limits of the public forms ("Suggest a listing", "Report a problem", the sign-in link),
// shared by the server (suggest-schema.ts, report-schema.ts, sign-in.ts) and the forms in the
// browser (src/components/suggest/, src/components/report/, src/components/account/). Kept apart
// from the schemas so that the browser does not load zod.

/** "Suggest a listing": the fields a person fills in, in the order of the form (and of the error summary). */
export const SUGGEST_FIELDS = ['url', 'kind', 'note', 'email', 'consent'] as const
export type SuggestField = (typeof SUGGEST_FIELDS)[number]

/** "Report a problem": the fields a person fills in, in the order of the form. */
export const REPORT_FIELDS = ['kind', 'details', 'email'] as const
export type ReportField = (typeof REPORT_FIELDS)[number]

/** Names of the other inputs the public forms send. */
export const FORM_INPUTS = {
  /** The spam check's answer (base64), written by the solver in the browser. */
  altcha: 'altcha',
  /**
   * The hidden field for spam programs. A name that browsers do not fill in automatically (not
   * "name", "email", "website" …), so a person's autofill never trips it.
   */
  honeypot: 'reference_code',
  locale: 'locale',
  /** "Report a problem": the item it is about (`job:{shortId}`), from the page's address. */
  item: 'item',
  /** Sign-in: where to go afterwards, a path on the site (src/lib/members/return-path.ts). */
  next: 'next',
} as const

/** The longest note, in UTF-16 code units: what the browser counts, and what Payload checks. */
export const NOTE_MAX = 500
/** The longest details of a report, counted the same way. */
export const DETAILS_MAX = 2000
/** The longest email address that can be delivered (RFC 5321). */
export const EMAIL_MAX = 254
