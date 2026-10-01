// A member's display name (members.display_name), from the settings form or an ORCID record: one
// rule for every way in, so the account page, the data export and any later email show a name
// that cannot hide or reorder the text around it.

/** The longest display name. */
export const DISPLAY_NAME_MAX = 80

/**
 * Control characters (C0 and C1, U+0085 and U+009B among them), line and paragraph separators,
 * and the direction marks, embeddings, overrides and isolates: never part of a name we show.
 */
export const UNSAFE_IN_NAME = /[\p{Cc}\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069]/u
