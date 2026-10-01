// Data requests (M4b, D8, D49; PLAN §3.2, §15.1, the data-requests page): what a person can ask
// for about their personal data, and where the request came from. Kept apart from the collection
// (src/collections/DataRequests.ts) so the form, the admin dashboard and the tests share it. The
// labels are the admin's (English, as the other collections); the form's come from the messages.

/** What the person asks for (KVKK Art. 11, GDPR Art. 15–21). */
export const DATA_REQUEST_KINDS = [
  { value: 'deletion', label: 'Delete my data' },
  { value: 'access', label: 'A copy of my data' },
  { value: 'correction', label: 'Correct my data' },
  { value: 'objection', label: 'Object to processing' },
  { value: 'restriction', label: 'Restrict processing (EU)' },
  { value: 'withdraw-consent', label: 'Withdraw consent' },
  { value: 'other', label: 'Something else' },
] as const

export type DataRequestKind = (typeof DATA_REQUEST_KINDS)[number]['value']

/** Where it came from. */
export const DATA_REQUEST_SOURCES = [
  // The form on /en/legal/data-requests/, recorded at once and acted on once confirmed.
  { value: 'form', label: 'Data-request form' },
  // "Delete my account" in a member's privacy settings, done at once.
  { value: 'account', label: 'Account settings' },
  // An email to privacy@, recorded here by an editor.
  { value: 'email', label: 'Email (recorded by an editor)' },
] as const

export type DataRequestSource = (typeof DATA_REQUEST_SOURCES)[number]['value']

export const isDataRequestKind = (value: unknown): value is DataRequestKind =>
  DATA_REQUEST_KINDS.some((kind) => kind.value === value)
