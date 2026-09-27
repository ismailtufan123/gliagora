import { describe, expect, it } from 'vitest'

import { SHORT_ID_PATTERN, newShortId } from './short-id'

describe('short IDs', () => {
  it('uses five characters from the ROR alphabet', () => {
    for (let i = 0; i < 200; i++) expect(newShortId()).toMatch(SHORT_ID_PATTERN)
  })

  it('leaves out letters that are easy to misread', () => {
    for (const id of ['k3f9i', 'k3f9l', 'k3f9o', 'k3f9u', 'K3F9A', 'k3f9', 'k3f9aa']) {
      expect(id).not.toMatch(SHORT_ID_PATTERN)
    }
  })
})
