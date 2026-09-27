import { describe, expect, it } from 'vitest'

import { GONE_PAGE, isGone } from './gone'

describe('isGone', () => {
  it('matches removed URLs with or without the trailing slash', () => {
    expect(isGone('/en/gone-example/')).toBe(true)
    expect(isGone('/en/gone-example')).toBe(true)
  })

  it('does not match other URLs, the removed-page itself or longer paths', () => {
    expect(isGone('/en/')).toBe(false)
    expect(isGone(GONE_PAGE)).toBe(false)
    expect(isGone('/en/gone-example/more/')).toBe(false)
    expect(isGone('/EN/GONE-EXAMPLE/')).toBe(false)
  })
})
