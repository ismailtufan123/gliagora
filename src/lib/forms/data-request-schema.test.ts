import { describe, expect, it } from 'vitest'

import { DATA_REQUEST_KINDS } from '@/lib/data-requests/kinds'

import {
  type DataRequestValues,
  parseDataRequest,
  readDataRequestValues,
} from './data-request-schema'
import { DETAILS_MAX, EMAIL_MAX, NAME_MAX } from './fields'

// The data-request form's checks (src/lib/forms/data-request-schema.ts): what it accepts, and what
// it keeps of a deletion (neither the name nor the details).

const values = (overrides: Partial<DataRequestValues> = {}): DataRequestValues => ({
  email: 'someone@example.org',
  kind: 'access',
  name: '',
  details: 'Please send me a copy of the data you hold about me.',
  ...overrides,
})

const errorsOf = (overrides: Partial<DataRequestValues>) => {
  const result = parseDataRequest(values(overrides), 'en')
  return result.ok ? {} : result.errors
}

describe('data-request form: the address', () => {
  it.each([
    ['', 'emailMissing'],
    ['   ', 'emailMissing'],
    ['not an address', 'emailInvalid'],
    ['name@example', 'emailInvalid'],
    [`${'a'.repeat(EMAIL_MAX - 11)}@example.org`, 'emailTooLong'],
  ])('refuses %j (%s)', (email, code) => {
    expect(errorsOf({ email })).toEqual({ email: code })
  })

  it('keeps the address in the form the link proves (trimmed, lowercased)', () => {
    expect(
      parseDataRequest(values({ email: '  Someone.Else+x@Example.ORG ' }), 'en'),
    ).toMatchObject({
      ok: true,
      data: { email: 'someone.else+x@example.org' },
    })
  })
})

describe('data-request form: what is asked for', () => {
  it('accepts each kind, and nothing else', () => {
    for (const { value } of DATA_REQUEST_KINDS) {
      expect(parseDataRequest(values({ kind: value }), 'en').ok, value).toBe(true)
    }
    expect(errorsOf({ kind: '' })).toEqual({ kind: 'kindMissing' })
    expect(errorsOf({ kind: 'delete' })).toEqual({ kind: 'kindMissing' })
  })

  it('needs the details for every request but a deletion', () => {
    for (const { value } of DATA_REQUEST_KINDS) {
      const errors = errorsOf({ kind: value, details: ' \r\n ' })
      expect(errors, value).toEqual(value === 'deletion' ? {} : { details: 'detailsMissing' })
    }
  })

  it('shows every problem at once, also the missing details when the address is wrong', () => {
    expect(errorsOf({ email: '', kind: 'correction', details: '' })).toEqual({
      email: 'emailMissing',
      details: 'detailsMissing',
    })
    expect(errorsOf({ email: '', kind: '', details: '' })).toEqual({
      email: 'emailMissing',
      kind: 'kindMissing',
    })
  })
})

describe('data-request form: name and details', () => {
  it('limits the name to 200 characters and the details to 2,000', () => {
    expect(errorsOf({ name: 'N'.repeat(NAME_MAX) })).toEqual({})
    expect(errorsOf({ name: 'N'.repeat(NAME_MAX + 1) })).toEqual({ name: 'nameTooLong' })
    expect(errorsOf({ details: 'd'.repeat(DETAILS_MAX) })).toEqual({})
    expect(errorsOf({ details: 'd'.repeat(DETAILS_MAX + 1) })).toEqual({
      details: 'detailsTooLong',
    })
    // Line breaks count once, as the browser counts them.
    expect(errorsOf({ details: 'd\r\n'.repeat(DETAILS_MAX / 2) })).toEqual({})
  })

  it('keeps the name on one line and the details as plain text', () => {
    const result = parseDataRequest(
      values({ name: '  Ada \n\t Lovelace‮ ', details: ' Line one\r\nline two\u0007 ' }),
      'en',
    )
    expect(result).toMatchObject({
      ok: true,
      data: { name: 'Ada Lovelace', details: 'Line one\nline two' },
    })
  })

  it('stores no empty name', () => {
    expect(parseDataRequest(values({ name: '   ' }), 'en')).toMatchObject({
      ok: true,
      data: { name: null },
    })
  })

  it('keeps neither the name nor the details of a deletion', () => {
    expect(
      parseDataRequest(
        values({ kind: 'deletion', name: 'Ada Lovelace', details: 'Delete everything.' }),
        'en',
      ),
    ).toEqual({
      ok: true,
      data: {
        email: 'someone@example.org',
        kind: 'deletion',
        name: null,
        details: null,
        locale: 'en',
      },
    })
  })

  it('reads an unknown locale as English', () => {
    expect(parseDataRequest(values(), 'xx')).toMatchObject({ ok: true, data: { locale: 'en' } })
  })
})

describe('readDataRequestValues', () => {
  it('reads the fields as sent, and anything that is not text as empty', () => {
    const form = new FormData()
    form.set('email', 'a@example.org')
    form.set('kind', 'deletion')
    form.set('name', new Blob(['x']))
    expect(readDataRequestValues(form)).toEqual({
      email: 'a@example.org',
      kind: 'deletion',
      name: '',
      details: '',
    })
  })
})
