import { describe, expect, it } from 'vitest'

import { contrastRatio, relativeLuminance } from './contrast'

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#1e2152', '#1E2152')).toBe(1)
  })

  it('does not depend on the order of the colours', () => {
    expect(contrastRatio('#146992', '#eef0f4')).toBe(contrastRatio('#eef0f4', '#146992'))
  })

  it('matches the DAPI blue finding in PLAN §7.2 (4.36:1 on cool paper)', () => {
    expect(contrastRatio('#1777a6', '#eef0f4')).toBeCloseTo(4.36, 2)
  })

  it('rejects colours that are not #rrggbb', () => {
    expect(() => relativeLuminance('#fff')).toThrow()
  })
})
