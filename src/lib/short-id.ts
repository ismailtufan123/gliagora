import { randomInt } from 'node:crypto'

// Short stable IDs at the end of URLs where the title can change (PLAN §2.1), e.g. `…-k3f9a`:
// five characters from the alphabet ROR uses for its IDs (digits and lowercase letters without
// i, l, o and u, so they are easy to read and do not spell words). Used by institutions without a
// ROR ID and by jobs.

const SHORT_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

export const SHORT_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{5}$/

export function newShortId(): string {
  return Array.from({ length: 5 }, () => SHORT_ID_ALPHABET[randomInt(32)]).join('')
}
