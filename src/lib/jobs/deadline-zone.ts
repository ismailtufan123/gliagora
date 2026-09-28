// How the admin fills a job's deadline time zone from its institution (D40), without the server
// lookup, so the job form's field (src/admin/DeadlineTimeZoneField.tsx) can use it.

/**
 * The deadline time zone after the editor chose another institution: the new institution's zone
 * (empty if it has none) when the field is empty or still holds the zone of the institution it
 * followed until now; undefined, for "leave it", when the editor chose another zone.
 */
export function followInstitution(
  current: string | null | undefined,
  before: string | null,
  after: string | null,
): string | null | undefined {
  const zone = current || null
  if (zone !== null && zone !== before) return undefined
  return zone === after ? undefined : after
}

/**
 * Whether the field, when it first appears in the form with an institution already chosen, takes
 * that institution's zone: only when it is empty and was not saved empty on purpose, that is on a
 * job not saved yet, or one saved with a rolling or open-ended deadline (which has no time zone).
 * Shown again later in the same form (the deadline was switched away from a fixed date and back),
 * the field is left as the editor left it.
 */
export function fillOnAppear(
  current: string | null | undefined,
  saved: { id?: number | string | null; deadlineKind?: string | null } | undefined,
): boolean {
  if (current) return false
  return saved?.id == null || (saved.deadlineKind ?? 'fixed') !== 'fixed'
}
