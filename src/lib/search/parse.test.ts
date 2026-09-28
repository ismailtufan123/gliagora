import { describe, expect, it } from 'vitest'

import {
  MAX_WORDS,
  SEARCH_MAX_LENGTH,
  canMatchInstitutions,
  normaliseQuery,
  readSearch,
  searchText,
} from './parse'

/**
 * The search for `q`, given the database's fold of it (foldSql; search.db.test.ts checks the
 * real one): for ASCII the fold is lower case, other folds are written out.
 */
const parse = (q: string, folded?: string) => {
  const text = searchText(q)!
  return readSearch(text, folded ?? text.toLowerCase())!
}

describe('normaliseQuery', () => {
  it('trims and keeps one space between words', () => {
    expect(normaliseQuery('  calcium \t\n imaging  ')).toBe('calcium imaging')
    expect(normaliseQuery('a\u0000b')).toBe('a b')
  })

  it('keeps at most 100 characters, counting letters rather than UTF-16 units', () => {
    expect(normaliseQuery('x'.repeat(150))).toHaveLength(SEARCH_MAX_LENGTH)
    const long = normaliseQuery('🧠'.repeat(150))
    expect(Array.from(long)).toHaveLength(SEARCH_MAX_LENGTH)
    expect(long).not.toMatch(/[\uD800-\uDBFF]$/)
  })

  it('composes accents typed as separate marks', () => {
    expect(normaliseQuery('Genève')).toBe('Genève')
  })
})

describe('searchText', () => {
  it('is null without a letter or digit, before asking the database', () => {
    for (const q of ['', '   ', '!!!', '"" - ? :*', '🧠🔬', '& | ! ( )', '̀̀̀']) {
      expect(searchText(q), q).toBeNull()
    }
    expect(searchText('4')).toBe('4')
    expect(searchText(' "cortical  circuit" -mouse ')).toBe('"cortical circuit" -mouse')
  })
})

describe('readSearch', () => {
  it('is null when folding leaves no letter or digit', () => {
    expect(readSearch('̀x', '')).toBeNull()
    expect(readSearch('x̀', 'x')).not.toBeNull()
  })

  it('keeps the text for the full-text search as typed, quotes and signs included', () => {
    expect(parse(' "cortical  circuit" -mouse ').text).toBe('"cortical circuit" -mouse')
    expect(parse("it's 50% C++").text).toBe("it's 50% C++")
    expect(parse('İstanbul', 'istanbul').text).toBe('İstanbul')
  })

  it('matches the last word as a prefix from three letters', () => {
    expect(parse('astro').prefix).toBe(true)
    expect(parse('calcium astro').prefix).toBe(true)
    expect(parse('astro,').prefix).toBe(true)
    expect(parse('as').prefix).toBe(false)
    expect(parse('C++').prefix).toBe(false)
    expect(parse('astro calcium').words).toEqual(['astro', 'calcium'])
  })

  it('counts letters as folded: marks and number signs are no letters', () => {
    // x with two combining graves folds to "x" (search.db.test.ts): one letter, no prefix.
    expect(parse('x̀̀', 'x').prefix).toBe(false)
    // Three marks after a space fold to nothing: the last word is "a".
    const marks = parse('a ̀̀̀', 'a ')
    expect(marks.words).toEqual(['a'])
    expect(marks.prefix).toBe(false)
    expect(parse('①②③').words).toEqual([])
    expect(parse('①②③').prefix).toBe(false)
  })

  it('does not match a phrase, a left-out word or `or` as a prefix', () => {
    expect(parse('"cortical circ"').prefix).toBe(false)
    expect(parse('"cortical circ').prefix).toBe(false)
    expect(parse('glia -mouse').prefix).toBe(false)
    expect(parse('phd or').prefix).toBe(false)
    // Typographic quotes and dashes fold to '"' and "-".
    expect(parse('glia “cortical circuit”', 'glia "cortical circuit"').prefix).toBe(false)
    expect(parse('neuron –mouse', 'neuron -mouse').prefix).toBe(false)
  })

  it('takes the letters and digits of the words, without the left-out ones', () => {
    expect(parse('-mouse rat').words).toEqual(['rat'])
    expect(parse('"cortical circuit"').words).toEqual(['cortical', 'circuit'])
    expect(parse('MSc/PhD', 'msc phd').words).toEqual(['msc', 'phd'])
    expect(parse('Max-Planck, (Berlin)').words).toEqual(['max', 'planck', 'berlin'])
    // `or` between two terms is web search's OR; elsewhere, and inside quotes, it is a word.
    expect(parse('glia or synapse').words).toEqual(['glia', 'synapse'])
    expect(parse('or glia').words).toEqual(['or', 'glia'])
    expect(parse('"a or b"').words).toEqual(['a', 'or', 'b'])
    expect(parse('a or or b').words).toEqual(['a', 'or', 'b'])
    expect(parse('a "b" or').words).toEqual(['a', 'b', 'or'])
    expect(parse('a or,?"b"').words).toEqual(['a', 'b'])
    expect(parse('a or-b').words).toEqual(['a', 'or', 'b'])
  })

  it('leaves out a whole phrase after a minus sign, as the full-text search does', () => {
    expect(parse('karolinska -"university hospital"').words).toEqual(['karolinska'])
    expect(parse('-"a b" c').words).toEqual(['c'])
    expect(parse('neuron –mouse', 'neuron -mouse').words).toEqual(['neuron'])
    expect(parse('-“a b” c', '-"a b" c').words).toEqual(['c'])
    // Operators and spaces between the sign and the word; two signs cancel out.
    expect(parse('- (mouse) rat').words).toEqual(['rat'])
    expect(parse('--mouse').words).toEqual(['mouse'])
    // A minus sign inside a word is part of it; one after an operator starts a new term.
    expect(parse('a-b').words).toEqual(['a', 'b'])
    expect(parse('a!-b c').words).toEqual(['a', 'c'])
    expect(parse('-a<b').words).toEqual(['b'])
  })

  it('reads the folded words, which the database folds like the indexed text', () => {
    expect(parse('İstanbul Üniversitesi', 'istanbul universitesi').words).toEqual([
      'istanbul',
      'universitesi',
    ])
    expect(parse('Genève', 'geneve').words).toEqual(['geneve'])
    // Repeats count once, in any case or with any accent.
    expect(parse('glia GLIA Glia').words).toEqual(['glia'])
    expect(parse('uni üni ûni', 'uni uni uni').words).toEqual(['uni'])
  })

  it('matches institutions by the longest of words that start one another', () => {
    const chain = parse('uni univ unive univer univers universi universit university')
    expect(chain.words).toEqual(['university'])
    expect(chain.allWords).toHaveLength(8)
    expect(parse('univ karolinska uni').words).toEqual(['univ', 'karolinska'])
  })

  it('keeps at most eight words for institutions, and every word for positions', () => {
    const q = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const search = parse(q)
    expect(search.words).toHaveLength(MAX_WORDS)
    expect(search.allWords.length).toBeGreaterThan(MAX_WORDS)
    expect(search.allWords).toContain('word14')
    expect(search.text.length).toBeLessThanOrEqual(SEARCH_MAX_LENGTH)
  })
})

describe('canMatchInstitutions', () => {
  it('needs one word of three letters or digits (the trigram index)', () => {
    expect(canMatchInstitutions(parse('KI'))).toBe(false)
    expect(canMatchInstitutions(parse('ab cd'))).toBe(false)
    expect(canMatchInstitutions(parse('KI MIT'))).toBe(true)
    expect(canMatchInstitutions(parse('-karolinska ki'))).toBe(false)
    expect(canMatchInstitutions(parse('-"karolinska institutet" ki'))).toBe(false)
  })

  it('counts letters as folded, so marks and number signs cannot pass for a word', () => {
    expect(canMatchInstitutions(parse('x̀̀', 'x'))).toBe(false)
    expect(canMatchInstitutions(parse('①②③ ¹²³'))).toBe(false)
    expect(canMatchInstitutions(parse('东京大'))).toBe(true)
  })
})
