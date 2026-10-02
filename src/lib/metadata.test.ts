import { describe, expect, it } from 'vitest'

import { CONTENT_PAGES } from './content'
import { alternatesFor } from './metadata'

describe('alternatesFor', () => {
  it('gives draft pages a canonical link only', () => {
    const drafts = () => true
    expect(alternatesFor('/en/contact/', drafts)).toEqual({ canonical: '/en/contact/' })
    expect(alternatesFor('/tr/iletisim/', drafts)).toEqual({ canonical: '/tr/iletisim/' })
    expect(alternatesFor('/en/legal/privacy/', drafts)).toEqual({ canonical: '/en/legal/privacy/' })
    // With the texts' own flags: the contact pages link to each other once both are approved.
    const bothApproved = !CONTENT_PAGES.contact.draft && !CONTENT_PAGES.iletisim.draft
    expect('languages' in (alternatesFor('/en/contact/') ?? {})).toBe(bothApproved)
  })

  it('links published translations to each other, with x-default in English', () => {
    const published = () => false
    expect(alternatesFor('/tr/iletisim/', published)).toEqual({
      canonical: '/tr/iletisim/',
      languages: {
        en: 'https://gliagora.com/en/contact/',
        tr: 'https://gliagora.com/tr/iletisim/',
        'x-default': 'https://gliagora.com/en/contact/',
      },
    })
  })

  it('leaves out a translation that is still a draft', () => {
    const turkishIsDraft = (path: string) => path === '/tr/iletisim/'
    expect(alternatesFor('/en/contact/', turkishIsDraft)).toEqual({ canonical: '/en/contact/' })
  })

  it('gives pages without a translation a canonical link only', () => {
    expect(alternatesFor('/en/about/')).toEqual({ canonical: '/en/about/' })
  })
})
