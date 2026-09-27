import { describe, expect, it } from 'vitest'

import { alternatesFor } from './metadata'

describe('alternatesFor', () => {
  it('gives draft pages a canonical link only', () => {
    // The contact pages are drafts in M1.
    expect(alternatesFor('/en/contact/')).toEqual({ canonical: '/en/contact/' })
    expect(alternatesFor('/tr/iletisim/')).toEqual({ canonical: '/tr/iletisim/' })
    expect(alternatesFor('/en/legal/privacy/')).toEqual({ canonical: '/en/legal/privacy/' })
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
