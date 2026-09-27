import { describe, expect, it } from 'vitest'

import { ORIGINAL_LANGUAGES, textDirection } from './languages'

/** The direction the runtime's locale data gives (`getTextInfo()`, or `textInfo` before it). */
function intlDirection(code: string): string | undefined {
  const locale = new Intl.Locale(code) as Intl.Locale & {
    getTextInfo?: () => { direction?: string }
    textInfo?: { direction?: string }
  }
  return (locale.getTextInfo?.() ?? locale.textInfo)?.direction
}

describe('textDirection', () => {
  it('marks right-to-left languages, and leaves the rest to the page', () => {
    expect(textDirection('ar')).toBe('rtl')
    expect(textDirection('he')).toBe('rtl')
    expect(textDirection('fa')).toBe('rtl')
    expect(textDirection('de')).toBeUndefined()
    expect(textDirection(undefined)).toBeUndefined()
  })

  it('agrees with the locale data for every language a posting may be in', () => {
    for (const { value } of ORIGINAL_LANGUAGES) {
      const direction = intlDirection(value)
      if (direction) expect([value, textDirection(value) ?? 'ltr']).toEqual([value, direction])
    }
  })
})
