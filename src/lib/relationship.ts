/**
 * The ID a relationship field holds. Payload gives an ID, or the related document itself when it
 * reads with depth > 0; an empty value gives undefined.
 */
export function idOf(value: unknown): number | string | undefined {
  const raw = typeof value === 'object' && value !== null && 'id' in value ? value.id : value
  return typeof raw === 'number' || (typeof raw === 'string' && raw !== '') ? raw : undefined
}
