import { describe, expect, it } from 'vitest'

import { limitAddress, normaliseEmail } from './email-address'

describe('normaliseEmail', () => {
  it.each([
    ['someone@example.org', 'someone@example.org'],
    ['  Someone@Example.ORG ', 'someone@example.org'],
    ['first.last+tag@example.org', 'first.last+tag@example.org'],
  ])('stores %j as %j', (typed, stored) => {
    expect(normaliseEmail(typed)).toBe(stored)
  })

  it.each([
    '',
    '   ',
    'not an address',
    'someone@example',
    'some one@example.org',
    'someone@@example.org',
    'someone..dots@example.org',
    `${'a'.repeat(250)}@example.org`,
  ])('refuses %j', (typed) => {
    expect(normaliseEmail(typed)).toBeNull()
  })
})

describe('limitAddress (one budget per mailbox)', () => {
  it.each([
    ['someone@example.org', 'someone@example.org'],
    ['Someone@Example.org', 'someone@example.org'],
    ['someone+news@example.org', 'someone@example.org'],
    ['someone+a+b@example.org', 'someone@example.org'],
    ['first.last@example.org', 'first.last@example.org'],
    ['First.Last@gmail.com', 'firstlast@gmail.com'],
    ['f.i.r.s.t.last+x@googlemail.com', 'firstlast@gmail.com'],
    ['firstlast@googlemail.com', 'firstlast@gmail.com'],
    ['+tag@example.org', '+tag@example.org'],
  ])('counts %j as %j', (typed, canonical) => {
    expect(limitAddress(typed)).toBe(canonical)
  })

  it('keeps dots outside Gmail, where they may name another mailbox', () => {
    expect(limitAddress('a.b@example.org')).not.toBe(limitAddress('ab@example.org'))
  })
})
