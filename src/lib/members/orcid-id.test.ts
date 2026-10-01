import { describe, expect, it } from 'vitest'

import { isOrcidId, orcidCheckCharacter } from './orcid-id'

// Test iDs are fakes: checksum-valid iDs starting with 9999, outside ORCID's issued ranges, and
// Josiah Carberry's, ORCID's fictional test record (support.orcid.org). Never a real person's iD.

describe('isOrcidId', () => {
  it.each([
    // Josiah Carberry, ORCID's fictional test record.
    '0000-0002-1825-0097',
    '9999-0000-0000-0019',
    // One ending in X.
    '9999-0000-0000-006X',
  ])('accepts %s', (value) => {
    expect(isOrcidId(value)).toBe(true)
  })

  it.each([
    '9999-0000-0000-0018', // wrong check character
    '9999-0000-0000-0060', // X expected
    '9999-0000-0000-001',
    '9999000000000019',
    '9999-0000-0000-0019 ',
    '9999-0000-0000-006x',
    'https://orcid.org/9999-0000-0000-0019',
    '',
  ])('refuses %j', (value) => {
    expect(isOrcidId(value)).toBe(false)
  })

  it('computes the check character with ISO 7064 MOD 11-2', () => {
    // ORCID's published example (the fictional record above).
    expect(orcidCheckCharacter('000000021825009')).toBe('7')
    expect(orcidCheckCharacter('999900000000001')).toBe('9')
    expect(orcidCheckCharacter('999900000000006')).toBe('X')
  })
})
