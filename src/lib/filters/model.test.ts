import { describe, expect, it } from 'vitest'

import {
  MAX_VALUES,
  activeFilters,
  clearAllHref,
  choice,
  emptyFilters,
  filtersHref,
  hrefWith,
  hrefWithout,
  isUnfiltered,
  list,
  normaliseText,
  one,
  page,
  pageHref,
  parseFilters,
  serializeFilters,
  text,
  withPage,
  withValue,
  withoutValue,
} from './model'

// A list with one parameter of each kind, as another window (events, funding) would declare it.
const lower = (raw: string) => (/^[a-z]+$/i.test(raw) ? raw.toLowerCase() : null)
const LIST = {
  path: '/en/things/',
  params: {
    colour: list(lower),
    size: list(lower),
    when: one((raw) => (['soon', 'later'].includes(raw) ? raw : null)),
    q: text(10),
    sort: choice(['name', 'date'], 'name'),
    page: page(),
  },
}

const parse = (query: string) => parseFilters(LIST, new URLSearchParams(query))
const canonical = (query: string) => serializeFilters(LIST, parse(query))

describe('parseFilters', () => {
  it('reads comma-separated and repeated values, de-duplicated and sorted', () => {
    expect(parse('colour=red,blue&colour=green&colour=red').colour).toEqual([
      'blue',
      'green',
      'red',
    ])
  })

  it('drops invalid values, empty values and unknown parameters', () => {
    const state = parse('colour=red,,b1ue,&size=&other=1&when=never')
    expect(state).toEqual({ ...emptyFilters(LIST), colour: ['red'] })
  })

  it('normalises values through the reader (case)', () => {
    expect(parse('colour=RED').colour).toEqual(['red'])
  })

  it('keeps at most MAX_VALUES values per list', () => {
    const many = Array.from({ length: MAX_VALUES + 5 }, (_, i) =>
      String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26)),
    )
    expect(parse(`colour=${many.join(',')}`).colour).toHaveLength(MAX_VALUES)
  })

  it('takes the first valid single value', () => {
    expect(parse('when=never&when=later,soon').when).toBe('later')
  })

  it('falls back to the default choice for an unknown one, in any case', () => {
    expect(parse('sort=DATE').sort).toBe('date')
    expect(parse('sort=size').sort).toBe('name')
  })

  it('trims free text, collapses white space and control characters, and cuts it', () => {
    expect(parse('q=%20%20two%0A%09words%20').q).toBe('two words')
    expect(parse('q=abcdefghijklmno').q).toBe('abcdefghij')
    expect(normaliseText('  a\u0000b  ', 10)).toBe('a b')
    // Characters, not UTF-16 units: the emoji is not cut in half.
    expect(normaliseText('123456789🧠x', 10)).toBe('123456789🧠')
  })

  it('reads page numbers from 1, and anything else as page 1', () => {
    expect(parse('page=3').page).toBe(3)
    for (const value of ['0', '-2', '2.5', 'two', '', '1e3', '123456']) {
      expect(parse(`page=${value}`).page, value).toBe(1)
    }
    expect(parse('page=007').page).toBe(7)
  })
})

describe('serializeFilters', () => {
  it('writes parameters in the configured order, whatever the order in the URL', () => {
    expect(canonical('sort=date&q=x&when=soon&size=l&colour=red&page=2')).toBe(
      'colour=red&size=l&when=soon&q=x&sort=date&page=2',
    )
  })

  it('leaves out defaults and empty values', () => {
    expect(canonical('sort=name&page=1&q=&colour=')).toBe('')
    expect(isUnfiltered(LIST, parse('sort=name&page=1'))).toBe(true)
    expect(isUnfiltered(LIST, parse('page=2'))).toBe(false)
  })

  it('keeps commas readable and encodes everything else as a form does', () => {
    expect(canonical('colour=red,blue')).toBe('colour=blue,red')
    expect(canonical('q=a+b%2Cc')).toBe('q=a+b,c')
    expect(canonical("q=it's+50%25")).toBe('q=it%27s+50%25')
    expect(canonical('q=%C3%BCber')).toBe('q=%C3%BCber')
  })

  it('sorts and de-duplicates lists it is given', () => {
    expect(serializeFilters(LIST, { ...emptyFilters(LIST), colour: ['red', 'blue', 'red'] })).toBe(
      'colour=blue,red',
    )
  })

  it('is stable: the canonical form reads back to itself', () => {
    for (const query of [
      'colour=red,blue&size=s,m,s',
      'q=%20mixed%20Case,%20comma%2B+plus',
      "q=quote's+%26+amp",
      'when=later&sort=date&page=12',
      'q=%E2%80%94%20dash',
    ]) {
      const once = canonical(query)
      expect(canonical(once), query).toBe(once)
      // Browsers leave every character of it unchanged.
      expect(new URL(`https://x.test/?${once}`).search.slice(1), query).toBe(once)
    }
  })
})

describe('link helpers', () => {
  const state = parse('colour=red,blue&q=word&sort=date&page=3')

  it('build full addresses, or the bare list', () => {
    expect(filtersHref(LIST, state)).toBe('/en/things/?colour=blue,red&q=word&sort=date&page=3')
    expect(filtersHref(LIST, emptyFilters(LIST))).toBe('/en/things/')
  })

  it('add and remove values, back on page 1, keeping the rest', () => {
    expect(filtersHref(LIST, withValue(LIST, state, 'colour', 'green'))).toBe(
      '/en/things/?colour=blue,green,red&q=word&sort=date',
    )
    expect(filtersHref(LIST, withValue(LIST, state, 'when', 'soon'))).toBe(
      '/en/things/?colour=blue,red&when=soon&q=word&sort=date',
    )
    expect(filtersHref(LIST, withoutValue(LIST, state, 'colour', 'red'))).toBe(
      '/en/things/?colour=blue&q=word&sort=date',
    )
    expect(filtersHref(LIST, withoutValue(LIST, state, 'q'))).toBe(
      '/en/things/?colour=blue,red&sort=date',
    )
  })

  it('give full paths for adding, removing, clearing and paging', () => {
    expect(hrefWith(LIST, state, 'size', 'l')).toBe(
      '/en/things/?colour=blue,red&size=l&q=word&sort=date',
    )
    expect(hrefWithout(LIST, state, 'colour', 'blue')).toBe(
      '/en/things/?colour=red&q=word&sort=date',
    )
    expect(clearAllHref(LIST)).toBe('/en/things/')
    expect(pageHref(LIST, state, 2)).toBe('/en/things/?colour=blue,red&q=word&sort=date&page=2')
  })

  it('go to another page', () => {
    expect(filtersHref(LIST, withPage(state, 1))).toBe(
      '/en/things/?colour=blue,red&q=word&sort=date',
    )
    expect(filtersHref(LIST, withPage(state, 4))).toContain('&page=4')
  })

  it('list the active filter values in URL order, without sort, view or page', () => {
    expect(activeFilters(LIST, parse('q=x&when=soon&colour=red,blue&sort=date&page=2'))).toEqual([
      { name: 'colour', value: 'blue' },
      { name: 'colour', value: 'red' },
      { name: 'when', value: 'soon' },
      { name: 'q', value: 'x' },
    ])
  })
})
