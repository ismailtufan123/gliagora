import { describe, expect, it } from 'vitest'

import { isRorId, parseRorId, rorUrl } from './ror-id'

describe('ROR IDs', () => {
  // Real IDs from the ROR registry (Caltech and three others).
  it.each(['05dxps055', '02d439m40', '01e6j9276', '05q79g396'])('accepts %s', (id) => {
    expect(isRorId(id)).toBe(true)
  })

  it.each([
    ['05dxps056', 'wrong checksum'],
    ['15dxps055', 'must start with 0'],
    ['05dxpi055', 'i is not in the ROR alphabet'],
    ['05dxpu055', 'u is not in the ROR alphabet'],
    ['05dxps05', 'too short'],
    ['05DXPS055', 'uppercase'],
    ['', 'empty'],
  ])('rejects %s (%s)', (id) => {
    expect(isRorId(id)).toBe(false)
  })

  it.each([
    'https://ror.org/05dxps055',
    'http://ror.org/05dxps055/',
    'ror.org/05dxps055',
    'https://www.ror.org/05dxps055',
    ' 05DXPS055 ',
  ])('reads %j as 05dxps055', (input) => {
    expect(parseRorId(input)).toBe('05dxps055')
  })

  it('returns null for text that is not a ROR ID', () => {
    expect(parseRorId('https://example.org/05dxps055')).toBeNull()
    expect(parseRorId('https://ror.org/05dxps056')).toBeNull()
  })

  it('builds the canonical URL', () => {
    expect(rorUrl('05dxps055')).toBe('https://ror.org/05dxps055')
  })
})
