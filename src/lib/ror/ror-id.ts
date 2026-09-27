// ROR identifiers (https://ror.readme.io/docs/identifier): "0", six Crockford base32 characters and a
// two-digit ISO 7064 Mod 97-10 checksum, e.g. 05dxps055. The full form is https://ror.org/05dxps055.

const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz'

export const ROR_ID_PATTERN = /^0[0-9a-hjkmnp-tv-z]{6}[0-9]{2}$/

function checksum(body: string): number {
  let value = 0n
  for (const char of body) value = value * 32n + BigInt(BASE32.indexOf(char))
  return 98 - Number((value * 100n) % 97n)
}

/** Whether `id` is a well-formed ROR ID (short form) with a correct checksum. */
export function isRorId(id: string): boolean {
  if (!ROR_ID_PATTERN.test(id)) return false
  return checksum(id.slice(1, 7)) === Number(id.slice(7))
}

/**
 * The short ROR ID from any usual way of writing it (`https://ror.org/05dxps055`, `ror.org/05dxps055`,
 * `05DXPS055`), or null if it is not a valid ROR ID.
 */
export function parseRorId(input: string): string | null {
  const id = input
    .trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/)?(?:www\.)?ror\.org\//, '')
    .replace(/\/$/, '')
  return isRorId(id) ? id : null
}

export const rorUrl = (id: string) => `https://ror.org/${id}`
