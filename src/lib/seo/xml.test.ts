import { describe, expect, it } from 'vitest'

import { escapeXml, latestDate, rfc822Date, w3cDate } from './xml'

describe('escapeXml', () => {
  it('escapes the five characters XML reserves', () => {
    expect(escapeXml(`R&D <lab> "quoted" 'single'`)).toBe(
      'R&amp;D &lt;lab&gt; &quot;quoted&quot; &apos;single&apos;',
    )
  })

  it('keeps other text as it is, including accents and scripts other than Latin', () => {
    expect(escapeXml('Sinirbilim · 神经科学 · Ümraniye – İstanbul')).toBe(
      'Sinirbilim · 神经科学 · Ümraniye – İstanbul',
    )
  })

  it('drops characters XML cannot hold, keeping tabs and line breaks', () => {
    expect(escapeXml('a\u0000b\u000Bc\u001Fd\te\nf\rg\uFFFEh\uD800i')).toBe('abcd\te\nf\rghi')
    // A surrogate pair is one character (an emoji) and stays.
    expect(escapeXml('brain 🧠')).toBe('brain 🧠')
  })

  it('escapes an ampersand once, never an escape it wrote', () => {
    expect(escapeXml('&amp;')).toBe('&amp;amp;')
  })
})

describe('w3cDate', () => {
  it('keeps a calendar day as a day', () => {
    expect(w3cDate('2026-09-27')).toBe('2026-09-27')
  })

  it('writes an instant in UTC to the second', () => {
    expect(w3cDate('2026-09-28T00:28:46.928Z')).toBe('2026-09-28T00:28:46Z')
    expect(w3cDate('2026-09-28T02:28:46.928+02:00')).toBe('2026-09-28T00:28:46Z')
    expect(w3cDate(new Date(Date.UTC(2026, 0, 5, 9, 3, 7)))).toBe('2026-01-05T09:03:07Z')
  })

  it('refuses what is not a date', () => {
    expect(() => w3cDate('not a date')).toThrow(RangeError)
    expect(() => w3cDate('2026-02-30')).toThrow(RangeError)
  })
})

describe('rfc822Date', () => {
  it('writes the RFC 822 form with a four-digit year, in GMT', () => {
    expect(rfc822Date('2026-09-28T00:28:46.753Z')).toBe('Mon, 28 Sep 2026 00:28:46 GMT')
    expect(rfc822Date('2026-11-01T23:30:00-05:00')).toBe('Mon, 02 Nov 2026 04:30:00 GMT')
  })

  it('refuses what is not a date', () => {
    expect(() => rfc822Date('')).toThrow(RangeError)
  })
})

describe('latestDate', () => {
  it('returns the latest value as it was given, so a day stays a day', () => {
    expect(latestDate(['2026-09-01', '2026-09-27', '2026-09-10'])).toBe('2026-09-27')
    expect(latestDate(['2026-09-27', '2026-09-27T10:00:00.000Z'])).toBe('2026-09-27T10:00:00.000Z')
  })

  it('skips missing and invalid values, and is null without any date', () => {
    expect(latestDate([null, undefined, 'garbage', '2026-01-02T00:00:00Z'])).toBe(
      '2026-01-02T00:00:00Z',
    )
    expect(latestDate([])).toBeNull()
    expect(latestDate([null, 'garbage'])).toBeNull()
  })
})
