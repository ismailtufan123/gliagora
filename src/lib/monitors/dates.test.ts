import { describe, expect, it } from 'vitest'

import {
  ageInDays,
  dayOf,
  deadlineFromText,
  deadlineFromValidThrough,
  hasClosed,
  openEndedFromText,
  publishedFromAddress,
  publishedFromText,
} from './dates'

const now = new Date('2026-10-16T10:00:00Z')
const day = (text: string, country: string | null = 'GB') =>
  deadlineFromText(text, country, now)?.date ?? null

describe('deadlineFromText', () => {
  it('reads English labels and dates', () => {
    expect(day('Closing date: 3 November 2026')).toBe('2026-11-03')
    expect(day('Application deadline: November 3, 2026')).toBe('2026-11-03')
    expect(day('The closing date for applications is 03 Nov 2026 at midnight.')).toBe('2026-11-03')
    expect(day('Apply by the 21st of December 2026')).toBe('2026-12-21')
    expect(day('Deadline 2026-11-30')).toBe('2026-11-30')
    expect(day('Last application date 16.Oct.2026', 'SE')).toBe('2026-10-16')
    expect(day('Closing Date & Time : 19-Oct-2026 12:00')).toBe('2026-10-19')
  })

  it('reads other languages', () => {
    expect(day('Bewerbungsfrist: 15.11.2026', 'DE')).toBe('2026-11-15')
    expect(day('Bewerbungsschluss ist der 1. Dezember 2026.', 'DE')).toBe('2026-12-01')
    expect(day('Date limite de candidature : 5 décembre 2026', 'FR')).toBe('2026-12-05')
    expect(day('Fecha límite: 20 de noviembre de 2026', 'ES')).toBe('2026-11-20')
    expect(day('Sista ansökningsdag: 2026-11-08', 'SE')).toBe('2026-11-08')
    expect(day('Søknadsfrist: 10.11.2026', 'NO')).toBe('2026-11-10')
    expect(day('Scadenza: 30 novembre 2026', 'IT')).toBe('2026-11-30')
    expect(day('Sluitingsdatum 12 december 2026', 'NL')).toBe('2026-12-12')
    expect(day('応募締切：2026年11月30日', 'JP')).toBe('2026-11-30')
    expect(day('截止日期：2026年12月1日', 'CN')).toBe('2026-12-01')
    expect(day('접수 마감: 2026년 11월 20일', 'KR')).toBe('2026-11-20')
  })

  it('reads 3/11/2026 as 11 March in the United States and 3 November elsewhere', () => {
    expect(day('Deadline: 3/11/2026', 'US')).toBe('2026-03-11')
    expect(day('Deadline: 3/11/2026', 'GB')).toBe('2026-11-03')
    expect(day('Deadline: 11/15/2026', 'GB')).toBe('2026-11-15')
    expect(day('Deadline: 15/11/2026', 'US')).toBe('2026-11-15')
  })

  it('takes a date only after a deadline word, and only a plausible one', () => {
    expect(day('Posted on 1 October 2026. Start: 1 January 2027.')).toBeNull()
    expect(day('Deadline: 31 February 2026')).toBeNull()
    expect(day('Deadline: 1 March 2035')).toBeNull()
  })

  it('names a time zone only when the posting names a clear one', () => {
    expect(
      deadlineFromText('Closing date: 3 November 2026, 23:59 UK time', 'GB', now)?.timeZone,
    ).toBe('Europe/London')
    expect(deadlineFromText('Deadline: November 3, 2026 11:59 pm EST', 'US', now)?.timeZone).toBe(
      'America/New_York',
    )
    expect(
      deadlineFromText('Bewerbungsfrist: 15.11.2026, 23:59 CET', 'DE', now)?.timeZone,
    ).toBeNull()
    expect(
      deadlineFromText('Date limite : 5 décembre 2026 et après', 'FR', now)?.timeZone,
    ).toBeNull()
  })

  it('says where it found the deadline', () => {
    expect(deadlineFromText('… Closing date: 3 November 2026 …', 'GB', now)?.from).toBe(
      'the text: "Closing date: 3 November 2026"',
    )
  })
})

describe('deadlineFromValidThrough', () => {
  it('takes the day as written', () => {
    expect(deadlineFromValidThrough('2026-11-03T23:59:00+01:00', now)?.date).toBe('2026-11-03')
    expect(deadlineFromValidThrough('2026-11-03', now)?.date).toBe('2026-11-03')
    expect(deadlineFromValidThrough('soon', now)).toBeNull()
    expect(deadlineFromValidThrough(undefined, now)).toBeNull()
  })
})

describe('openEndedFromText', () => {
  it('finds postings without a fixed day', () => {
    expect(openEndedFromText('The post remains open until the position is filled.')?.value).toBe(
      'until-filled',
    )
    expect(openEndedFromText('Applications are reviewed on a rolling basis.')?.value).toBe(
      'rolling',
    )
    expect(openEndedFromText('Closing date: 3 November 2026')).toBeNull()
  })
})

describe('hasClosed', () => {
  it('waits until the day has ended everywhere', () => {
    expect(hasClosed('2026-10-14', now)).toBe(true)
    expect(hasClosed('2026-10-15', now)).toBe(false)
    expect(hasClosed('2026-10-16', now)).toBe(false)
  })
})

describe('when a posting was published', () => {
  const published = (text: string, country: string | null = 'GB') =>
    publishedFromText(text, country, now)?.date ?? null

  it('reads the day a feed, an API or JSON-LD gives', () => {
    expect(dayOf('2025-03-12', now)).toBe('2025-03-12')
    expect(dayOf('2025-03-12T09:30:00+09:00', now)).toBe('2025-03-12')
    expect(dayOf('Wed, 12 Mar 2025 09:30:00 GMT', now)).toBe('2025-03-12')
    expect(dayOf('not a date', now)).toBeNull()
    // Not in the future, nor more than ten years back.
    expect(dayOf('2027-01-01', now)).toBeNull()
    expect(dayOf('2001-01-01', now)).toBeNull()
  })

  it('reads a day right after a "posted" or "published" word, in several languages', () => {
    expect(published('Posted: 12 March 2025')).toBe('2025-03-12')
    expect(published('Date posted 2025-03-12 | Reference 123')).toBe('2025-03-12')
    expect(published('Posting Start Date: 24/04/2026', 'SG')).toBe('2026-04-24')
    expect(published('Veröffentlicht am 12.03.2025', 'DE')).toBe('2025-03-12')
    expect(published('Date de publication : 12 mars 2025', 'FR')).toBe('2025-03-12')
    expect(published('İlan tarihi: 12.03.2025', 'TR')).toBe('2025-03-12')
    expect(published('掲載日：2025年3月12日', 'JP')).toBe('2025-03-12')
    expect(published('发布时间：2025-03-12 10:00', 'CN')).toBe('2025-03-12')
    // A deadline is not a publication day, and a day far after the word is not taken.
    expect(published('Posted until 30 November 2026')).toBeNull()
    expect(
      published('Our results were published in a journal of the society on 12 March 2025'),
    ).toBeNull()
    // A label inside a sentence is not a field of the posting.
    expect(published('a lab whose work was published 3 May 2019 in Neuron')).toBeNull()
    expect(published('About us\nPublished: 3 May 2025\nApply now')).toBe('2025-05-03')
  })

  it("reads a day in the posting's address", () => {
    const at = (address: string) => publishedFromAddress(address, now)?.date ?? null
    expect(at('https://www.riken.jp/en/careers/researchers/20250512_1/index.html')).toBe(
      '2025-05-12',
    )
    expect(at('https://cebsit.cas.cn/zpxxi/bsh/202601/t20260115_123456.html')).toBe('2026-01-15')
    expect(at('https://example.org/2025/11/03/postdoc-in-neuroscience/')).toBe('2025-11-03')
    expect(at('https://example.org/jobs/20251399/')).toBeNull()
    // A bare eight-digit segment may be an ID.
    expect(at('https://example.org/vacancy/20190312/')).toBeNull()
    expect(at('https://example.org/jobs/12345678/')).toBeNull()
  })

  it('counts whole days', () => {
    expect(ageInDays('2026-10-16', now)).toBe(0)
    expect(ageInDays('2026-08-17', now)).toBe(60)
    expect(ageInDays('2025-10-16', now)).toBe(365)
  })
})
