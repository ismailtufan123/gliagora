import { describe, expect, it } from 'vitest'

import { slugify } from './slug'

describe('slugify', () => {
  it.each([
    ['California Institute of Technology', 'california-institute-of-technology'],
    ['İstanbul Üniversitesi', 'istanbul-universitesi'],
    ['Boğaziçi Üniversitesi', 'bogazici-universitesi'],
    ['Orta Doğu Teknik Üniversitesi (ODTÜ)', 'orta-dogu-teknik-universitesi-odtu'],
    ['Universität Zürich', 'universitat-zurich'],
    ['Ludwig-Maximilians-Universität München', 'ludwig-maximilians-universitat-munchen'],
    ['Straße', 'strasse'],
    ['Københavns Universitet', 'kobenhavns-universitet'],
    ['Uniwersytet Łódzki', 'uniwersytet-lodzki'],
    ['Háskóli Íslands', 'haskoli-islands'],
    ['Texas A&M University', 'texas-a-and-m-university'],
    ['  Max Planck Institute for Brain Research  ', 'max-planck-institute-for-brain-research'],
    ['Institut Pasteur — Paris', 'institut-pasteur-paris'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug)
  })

  it('uses the fallback for names without Latin letters or digits', () => {
    expect(slugify('東京大学', { fallback: 'institution' })).toBe('institution')
    expect(slugify('', { fallback: 'institution' })).toBe('institution')
  })

  it('keeps Latin words and digits from mixed names', () => {
    expect(slugify('Université Paris 13 — 巴黎')).toBe('universite-paris-13')
  })

  it('cuts long names at a word boundary', () => {
    const slug = slugify('Word '.repeat(40), { maxLength: 22 })
    expect(slug).toBe('word-word-word-word')
    expect(slugify('a'.repeat(100), { maxLength: 10 })).toBe('aaaaaaaaaa')
  })
})
