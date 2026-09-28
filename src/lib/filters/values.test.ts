import { describe, expect, it } from 'vitest'

import {
  deadlineFilter,
  deadlineRange,
  readCountry,
  readDeadline,
  readInstitution,
  readRegion,
  readSlug,
} from './values'

describe('filter values', () => {
  it('slugs: lower-case words joined by single hyphens', () => {
    expect(readSlug('Systems-Circuits')).toBe('systems-circuits')
    for (const bad of ['', 'a--b', '-a', 'a-', 'a_b', 'ä', 'a b', 'x'.repeat(65)]) {
      expect(readSlug(bad), bad).toBeNull()
    }
  })

  it('countries: two letters, in capitals', () => {
    expect(readCountry('tr')).toBe('TR')
    expect(readCountry('XK')).toBe('XK')
    for (const bad of ['', 'T', 'TUR', '1A', 'T-']) expect(readCountry(bad), bad).toBeNull()
  })

  it('regions: the UN M49 regions of the filter', () => {
    expect(readRegion('Latin-America-Caribbean')).toBe('latin-america-caribbean')
    for (const bad of ['americas', 'western-europe', '']) expect(readRegion(bad), bad).toBeNull()
  })

  it('institutions: a ROR ID with a valid checksum, or a short ID', () => {
    expect(readInstitution('05DXPS055')).toBe('05dxps055')
    expect(readInstitution('b7c2d')).toBe('b7c2d')
    for (const bad of ['05dxps056', '15dxps055', 'b7c2i', 'b7c2', 'ror.org/05dxps055']) {
      expect(readInstitution(bad), bad).toBeNull()
    }
  })

  it('deadlines: windows, this month, or a range of real days in order', () => {
    expect(readDeadline('14D')).toBe('14d')
    expect(deadlineFilter('14d')).toEqual({ kind: 'within', days: 14 })
    expect(deadlineFilter('this-month')).toEqual({ kind: 'this-month' })
    expect(deadlineFilter('2026-10-01..2026-12-31')).toEqual({
      kind: 'range',
      from: '2026-10-01',
      to: '2026-12-31',
    })
    expect(deadlineRange('2026-02-28', '2026-02-29')).toBeNull()
    expect(deadlineRange('2028-02-28', '2028-02-29')).toBe('2028-02-28..2028-02-29')
    expect(deadlineRange(null, '2026-10-01')).toBeNull()
    for (const bad of ['0d', '10d', 'next-month', '2026-10-01..2026-09-30', '2026-1-1..2026-2-1']) {
      expect(readDeadline(bad), bad).toBeNull()
    }
  })
})
