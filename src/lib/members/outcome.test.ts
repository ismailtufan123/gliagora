import { describe, expect, it } from 'vitest'

import { newReference } from '@/lib/forms/public-form'

import { DONE_CODES, ERROR_CODES, outcomePath, readOutcome } from './outcome'

// The messages after a redirect (src/lib/members/outcome.ts): only known codes, only references in
// the form the server makes, and every redirect aimed at the message itself.

const ALL = { done: DONE_CODES, error: ERROR_CODES }

describe('readOutcome', () => {
  it.each([
    [{ done: 'created' }, { kind: 'done', code: 'created', othersEnded: false }],
    [{ done: 'signed-in' }, { kind: 'done', code: 'signed-in', othersEnded: false }],
    [
      { done: 'linked-orcid', others: 'ended' },
      { kind: 'done', code: 'linked-orcid', othersEnded: true },
    ],
    [
      { done: 'unlinked-google', others: 'yes' },
      { kind: 'done', code: 'unlinked-google', othersEnded: false },
    ],
    [
      { error: 'cancelled', others: 'ended' },
      { kind: 'error', code: 'cancelled', reference: null },
    ],
    [
      { error: 'orcid-elsewhere', ref: '3F2A9C01D4' },
      { kind: 'error', code: 'orcid-elsewhere', reference: '3F2A9C01D4' },
    ],
    [{ error: 'link-expired' }, { kind: 'error', code: 'link-expired', reference: null }],
    [
      { error: 'failed', ref: '3F2A9C01D4' },
      { kind: 'error', code: 'failed', reference: '3F2A9C01D4' },
    ],
    // An error wins over a success.
    [
      { done: 'created', error: 'failed' },
      { kind: 'error', code: 'failed', reference: null },
    ],
  ])('reads %j', (params, expected) => {
    expect(readOutcome(params, ALL)).toEqual(expected)
  })

  it.each([
    {},
    { done: 'linked' },
    { error: '<script>' },
    { done: ['created', 'created'] },
    { error: 'Failed' },
  ])('shows nothing for %j', (params) => {
    expect(readOutcome(params, ALL)).toBeNull()
  })

  it('shows only the codes the page allows', () => {
    expect(readOutcome({ done: 'created' }, { error: ['failed'] })).toBeNull()
    expect(readOutcome({ error: 'link-expired' }, { error: ['failed'] })).toBeNull()
  })

  it.each(['3f2a9c01d4', '3F2A9C01D', '3F2A9C01D4X', 'call 0800 now', ''])(
    'drops a reference that the server cannot have made: %j',
    (ref) => {
      expect(readOutcome({ error: 'failed', ref }, ALL)).toEqual({
        kind: 'error',
        code: 'failed',
        reference: null,
      })
    },
  )

  it('keeps every reference the server makes', () => {
    for (let i = 0; i < 20; i++) {
      const reference = newReference()
      expect(readOutcome({ error: 'failed', ref: reference }, ALL)).toMatchObject({ reference })
    }
  })
})

describe('outcomePath', () => {
  it('ends at the message, which the browser then focuses', () => {
    expect(outcomePath('/en/account/', { done: 'created' })).toBe(
      '/en/account/?done=created#outcome',
    )
    expect(outcomePath('/en/sign-in/', { error: 'failed', reference: '3F2A9C01D4' })).toBe(
      '/en/sign-in/?error=failed&ref=3F2A9C01D4#outcome',
    )
    expect(outcomePath('/en/sign-in/', { error: 'link-expired', reference: 'bad' })).toBe(
      '/en/sign-in/?error=link-expired#outcome',
    )
  })

  it('says when other browsers were signed out', () => {
    expect(outcomePath('/en/account/', { done: 'linked-google', othersEnded: true })).toBe(
      '/en/account/?done=linked-google&others=ended#outcome',
    )
    expect(outcomePath('/en/account/', { done: 'linked-google', othersEnded: false })).toBe(
      '/en/account/?done=linked-google#outcome',
    )
  })

  it('keeps the parameters the page needs besides the outcome, and only those with a value', () => {
    expect(
      outcomePath(
        '/en/sign-in/',
        { error: 'cancelled' },
        { next: '/en/jobs/?type=phd', save: null },
      ),
    ).toBe('/en/sign-in/?next=%2Fen%2Fjobs%2F%3Ftype%3Dphd&error=cancelled#outcome')
  })

  it('reads back as what it wrote', () => {
    const path = outcomePath('/en/sign-in/', { error: 'failed', reference: '0123456789' })
    const query = Object.fromEntries(new URL(path, 'http://localhost').searchParams)
    expect(readOutcome(query, ALL)).toEqual({
      kind: 'error',
      code: 'failed',
      reference: '0123456789',
    })
  })
})
