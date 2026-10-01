import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// Secrets of member sign-in (M4b, D49; the M4b design §8): session tokens and email links are 32
// random bytes, written base64url (43 characters). The database keeps only their SHA-256 (hex),
// so a copy of it (or a backup) signs nobody in, and a token is looked up by its hash through a
// unique index: no secret is compared in JavaScript. Values the server compares itself (an OAuth
// `state`, an email link's browser binding) are compared in constant time.

/** A session token or an email link's token: 32 random bytes, base64url. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** SHA-256 in hex, the only form of a token the database holds. */
export const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Whether `value` has the shape of a token (anything else is refused before any lookup). */
export function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

/** The stored form of a token (or of a browser binding): SHA-256, hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Whether two secrets are equal, in constant time. Both are hashed first, so neither their length
 * nor where they differ shows in the time taken.
 */
export function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a, 'utf8').digest(),
    createHash('sha256').update(b, 'utf8').digest(),
  )
}

/**
 * An email link's binding to the browser that asked for it (the M4b design §7.1): 16 random bytes,
 * kept in that browser's sealed sign-in cookie; the token row stores its hash.
 */
export function newBinding(): string {
  return randomBytes(16).toString('base64url')
}

/** Whether the binding from the sign-in cookie belongs to a token with `browserHash`. */
export function bindingMatches(binding: string, browserHash: string | null | undefined): boolean {
  if (!browserHash || !TOKEN_HASH_PATTERN.test(browserHash)) return false
  return timingSafeEqual(Buffer.from(hashToken(binding), 'hex'), Buffer.from(browserHash, 'hex'))
}
