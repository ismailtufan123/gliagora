// ORCID iDs (M4b, D49): what ORCID sends as `sub` and what a member's account stores. Sixteen
// characters in four groups, the last one a check character computed with ISO 7064 MOD 11-2
// (https://support.orcid.org/hc/en-us/articles/360006897674). The database checks the format too
// (src/migrations/, the member constraints); the check character only here.

/** Four groups of four; the last character is a digit or X. */
export const ORCID_ID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/

/** The check character of the first 15 digits (ISO 7064 MOD 11-2). */
export function orcidCheckCharacter(digits: string): string {
  let total = 0
  for (const digit of digits) total = (total + Number(digit)) * 2
  const result = (12 - (total % 11)) % 11
  return result === 10 ? 'X' : String(result)
}

/** Whether `value` is an ORCID iD with the right check character. */
export function isOrcidId(value: string): boolean {
  if (!ORCID_ID_PATTERN.test(value)) return false
  const digits = value.replaceAll('-', '')
  return orcidCheckCharacter(digits.slice(0, 15)) === digits.slice(15)
}
