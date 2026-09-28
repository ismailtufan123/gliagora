// Short stable IDs at the end of URLs where the title can change (PLAN §2.1), e.g. `…-k3f9a`:
// five characters from the alphabet ROR uses for its IDs (digits and lowercase letters without
// i, l, o and u, so they are easy to read and do not spell words). Used by institutions without a
// ROR ID and by jobs. No Node.js imports: the jobs filters check IDs in the browser too.

const SHORT_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** One character of a short ID, as a regular-expression class (for URL patterns). */
export const SHORT_ID_CHAR = '[0-9a-hjkmnp-tv-z]'

export const SHORT_ID_PATTERN = new RegExp(`^${SHORT_ID_CHAR}{5}$`)

export function newShortId(): string {
  // 256 is a multiple of the alphabet's 32 characters, so every character is equally likely.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(5))
  return Array.from(bytes, (byte) => SHORT_ID_ALPHABET[byte % 32]).join('')
}
