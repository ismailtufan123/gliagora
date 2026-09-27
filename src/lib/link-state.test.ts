import { describe, expect, it } from 'vitest'

import { linkState } from './link-state'
import { translationsOf } from './site'

describe('linkState', () => {
  it('marks the page a link leads to', () => {
    expect(linkState('/en/jobs/', '', '/en/jobs/')).toBe('page')
    expect(linkState('/en/jobs', '', '/en/jobs/')).toBe('page')
  })

  it('matches the query string too', () => {
    expect(linkState('/en/jobs/', '?type=phd', '/en/jobs/?type=phd')).toBe('page')
    expect(linkState('/en/jobs/', '?type=msc', '/en/jobs/?type=phd')).toBeUndefined()
    expect(linkState('/en/jobs/', '', '/en/jobs/?type=phd')).toBeUndefined()
  })

  it('marks the section of a filtered list or a deeper page', () => {
    expect(linkState('/en/jobs/', '?type=phd', '/en/jobs/')).toBe('section')
    expect(linkState('/en/learn/bench-to-bedside/', '', '/en/learn/')).toBe('section')
  })

  it('does not match other pages or prefixes of other words', () => {
    expect(linkState('/en/', '', '/en/jobs/')).toBeUndefined()
    expect(linkState('/en/newsletter/', '', '/en/news/')).toBeUndefined()
  })
})

describe('translationsOf', () => {
  it('finds the other language of a translated page', () => {
    expect(translationsOf('/en/contact/')).toEqual({ en: '/en/contact/', tr: '/tr/iletisim/' })
    expect(translationsOf('/tr/iletisim/')).toEqual({ en: '/en/contact/', tr: '/tr/iletisim/' })
  })

  it('returns nothing for pages without a translation', () => {
    expect(translationsOf('/en/')).toEqual({})
    expect(translationsOf('/en/contact')).toEqual({})
  })
})
