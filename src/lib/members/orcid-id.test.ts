import { describe, expect, it } from 'vitest'

import { isOrcidId, orcidCheckCharacter } from './orcid-id'

describe('isOrcidId', () => {
  it.each([
    // ORCID's own examples (support.orcid.org), one ending in X.
    '0000-0002-1825-0097',
    '0000-0001-5109-3700',
    '0000-0002-1694-233X',
  ])('accepts %s', (value) => {
    expect(isOrcidId(value)).toBe(true)
  })

  it.each([
    '0000-0002-1825-0098', // wrong check character
    '0000-0002-1694-2330', // X expected
    '0000-0002-1825-009',
    '0000000218250097',
    '0000-0002-1825-0097 ',
    '0000-0002-1825-009x',
    'https://orcid.org/0000-0002-1825-0097',
    '',
  ])('refuses %j', (value) => {
    expect(isOrcidId(value)).toBe(false)
  })

  it('computes the check character with ISO 7064 MOD 11-2', () => {
    expect(orcidCheckCharacter('000000021825009')).toBe('7')
    expect(orcidCheckCharacter('000000021694233')).toBe('X')
    // The fake iDs of the tests start with 9999, outside ORCID's ranges.
    const fake = `9999-0000-0000-001${orcidCheckCharacter('999900000000001')}`
    expect(isOrcidId(fake)).toBe(true)
  })
})
