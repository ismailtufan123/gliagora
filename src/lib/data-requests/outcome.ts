// What a deletion done by the site itself deleted (M4b, D49; the M4b design §6, §7.8): counts only,
// kept in the data request's `outcome` (JSON) and told in the final email (`sendRequestEmails`).
// Never what was deleted.

export type DeletionOutcome = {
  /** Suggestions sent with the address, deleted. */
  suggestionsDeleted: number
  /** A member account with the address, deleted (0 or 1). */
  accountDeleted: 0 | 1
  /** Reports sent with the address whose address was cleared. */
  reportAddressesCleared: number
  /** Requests about personal rights (Law No. 5651) sent with the address, which keep it. */
  personalRightsReportsKept: number
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0

/** The counts in a stored `outcome`, each 0 when missing or not a count. */
export function deletionOutcome(value: unknown): DeletionOutcome {
  const stored = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    suggestionsDeleted: count(stored.suggestionsDeleted),
    accountDeleted: count(stored.accountDeleted) > 0 ? 1 : 0,
    reportAddressesCleared: count(stored.reportAddressesCleared),
    personalRightsReportsKept: count(stored.personalRightsReportsKept),
  }
}
