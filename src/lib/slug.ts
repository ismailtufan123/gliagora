// Letters that do not decompose into a base letter plus accents (NFKD), so need their own mapping.
const SPECIAL: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ħ: 'h',
  ı: 'i',
  ł: 'l',
  þ: 'th',
}

/**
 * Lower case with accents removed, the same in every locale: `İstanbul Üniversitesi` →
 * `istanbul universitesi` (the Turkish İ and ı both become i). Other scripts are kept.
 */
export function foldAccents(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[ßæœøđðħıłþ]/g, (char) => SPECIAL[char] ?? char)
}

/**
 * A URL slug from a name (PLAN §2.1): lowercase ASCII words joined by hyphens, accents removed
 * (`İstanbul Üniversitesi` → `istanbul-universitesi`), at most `maxLength` characters, cut at a
 * word boundary. Names without Latin letters or digits give `fallback`.
 */
export function slugify(text: string, { maxLength = 80, fallback = 'item' } = {}): string {
  const ascii = foldAccents(text).replace(/&/g, ' and ')
  const words = ascii.split(/[^a-z0-9]+/).filter(Boolean)
  let slug = ''
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word
    if (next.length > maxLength) break
    slug = next
  }
  if (!slug && words[0]) slug = words[0].slice(0, maxLength)
  return slug || fallback
}
