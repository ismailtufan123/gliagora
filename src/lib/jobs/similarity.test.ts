import { describe, expect, it } from 'vitest'

import {
  duplicateReason,
  likelyDuplicate,
  normaliseTitle,
  similarity,
  trigrams,
  type DedupeFacts,
} from './similarity'

describe('normaliseTitle', () => {
  it('lower-cases in every locale, including the Turkish İ and ı', () => {
    expect(normaliseTitle('İSTANBUL Doktora Bursu')).toBe('istanbul doktora bursu')
    expect(normaliseTitle('Işık ve Sinir Hücreleri')).toBe('isik ve sinir hucreleri')
    expect(normaliseTitle('DIŞ')).toBe(normaliseTitle('dış'))
  })

  it('removes accents and turns punctuation into single spaces', () => {
    expect(normaliseTitle('  Doctorant·e – Neurosciences (H/F)  ')).toBe(
      'doctorant e neurosciences h f',
    )
    expect(normaliseTitle('Straße, Øresund & Łódź!')).toBe('strasse oresund lodz')
    expect(normaliseTitle('Postdoc:\tcortical\n\ncircuits')).toBe('postdoc cortical circuits')
  })

  it('keeps letters of other scripts', () => {
    expect(normaliseTitle('神经科学 博士后')).toBe('神经科学 博士后')
  })
})

describe('trigrams and similarity (as in pg_trgm)', () => {
  it('pads each word with two spaces in front and one behind', () => {
    expect([...trigrams('cat')].sort()).toEqual(['  c', ' ca', 'at ', 'cat'])
    expect([...trigrams('a')].sort()).toEqual(['  a', ' a '])
    expect(trigrams('Cat, cat!').size).toBe(4)
  })

  it('matches the example in the PostgreSQL documentation', () => {
    // SELECT similarity('word', 'two words') → 0.36363637
    expect(similarity('word', 'two words')).toBeCloseTo(4 / 11, 6)
  })

  it('is 1 for the same words and 0 for empty text', () => {
    expect(similarity('phd position glia', 'glia phd position')).toBe(1)
    expect(similarity('', 'anything')).toBe(0)
    expect(similarity('', '')).toBe(0)
  })

  it('counts characters, not bytes', () => {
    expect([...trigrams('ağ')].sort()).toEqual(['  a', ' ağ', 'ağ '])
  })
})

describe('duplicateReason', () => {
  const base: DedupeFacts = {
    canonicalUrl: 'https://example.org/jobs/1',
    institution: 12,
    deadlineKind: 'fixed',
    deadlineDay: '2026-12-01',
    fingerprint: normaliseTitle('PhD position in cortical circuit imaging'),
  }

  it('finds the same address whatever else differs', () => {
    expect(
      duplicateReason(base, {
        canonicalUrl: base.canonicalUrl,
        institution: 99,
        deadlineKind: 'rolling',
        fingerprint: 'something else',
      }),
    ).toBe('same-address')
  })

  it('finds nearly the same title at the same institution with the same deadline', () => {
    const other = {
      ...base,
      canonicalUrl: 'https://example.org/jobs/2',
      fingerprint: normaliseTitle('PhD position in cortical circuit imaging (m/f/d)'),
    }
    expect(similarity(base.fingerprint!, other.fingerprint!)).toBeGreaterThanOrEqual(0.8)
    expect(duplicateReason(base, other)).toBe('similar-title')
    expect(duplicateReason(base, { ...other, institution: '12' })).toBe('similar-title')
  })

  it('needs the same institution and the same deadline for similar titles', () => {
    const other = { ...base, canonicalUrl: null }
    expect(likelyDuplicate(base, { ...other, institution: 13 })).toBe(false)
    expect(likelyDuplicate(base, { ...other, deadlineDay: '2026-12-02' })).toBe(false)
    expect(likelyDuplicate(base, { ...other, deadlineKind: 'rolling', deadlineDay: null })).toBe(
      false,
    )
    expect(likelyDuplicate(base, { ...other, deadlineDay: null })).toBe(false)
  })

  it('counts two rolling deadlines, or two "until filled", as the same deadline', () => {
    const rolling = { ...base, canonicalUrl: null, deadlineKind: 'rolling' as const }
    expect(duplicateReason(rolling, { ...rolling, deadlineDay: '2030-01-01' })).toBe(
      'similar-title',
    )
    expect(duplicateReason(rolling, { ...rolling, deadlineKind: 'until-filled' })).toBeNull()
  })

  it('keeps different positions apart', () => {
    const other = {
      ...base,
      canonicalUrl: null,
      fingerprint: normaliseTitle('Postdoc in hippocampal memory circuits'),
    }
    expect(duplicateReason(base, other)).toBeNull()
    expect(duplicateReason({ ...base, canonicalUrl: null }, { canonicalUrl: null })).toBeNull()
  })
})
