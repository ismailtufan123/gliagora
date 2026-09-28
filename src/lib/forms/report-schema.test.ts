import { describe, expect, it } from 'vitest'

import { REPORT_KINDS, kindsFor } from '@/lib/reports/status'

import { DETAILS_MAX, EMAIL_MAX } from './fields'
import { readControls } from './public-form'
import { type ReportValues, parseReport, readReportValues } from './report-schema'

const values = (overrides: Partial<ReportValues> = {}): ReportValues => ({
  kind: 'wrong-fact',
  details: 'The deadline on the original posting is 14 November.',
  email: '',
  item: 'job:test1',
  ...overrides,
})

const errorsOf = (overrides: Partial<ReportValues>) => {
  const result = parseReport(values(overrides), 'en')
  return result.ok ? {} : result.errors
}

describe('report form: what is wrong', () => {
  it('accepts each kind, and nothing else', () => {
    for (const { value } of REPORT_KINDS) {
      const email = value === 'personal-rights' ? 'someone@example.org' : ''
      expect(parseReport(values({ kind: value, email }), 'en').ok, value).toBe(true)
    }
    expect(errorsOf({ kind: '' })).toEqual({ kind: 'kindMissing' })
    expect(errorsOf({ kind: 'spam' })).toEqual({ kind: 'kindMissing' })
  })
})

describe('report form: what is wrong with an institution', () => {
  const institution = 'institution:05dxps055'

  it('accepts the kinds that fit an institution', () => {
    for (const value of kindsFor('institution')) {
      const email = value === 'personal-rights' ? 'someone@example.org' : ''
      expect(
        parseReport(values({ kind: value, email, item: institution }), 'en'),
        value,
      ).toMatchObject({
        ok: true,
        data: { kind: value, item: { type: 'institution', id: '05dxps055' } },
      })
    }
  })

  it('refuses, at the field, a kind that only a job can have', () => {
    for (const kind of ['closed', 'not-employer']) {
      expect(errorsOf({ kind, item: institution }), kind).toEqual({ kind: 'kindJobOnly' })
      // For a job and without an item, as before.
      expect(parseReport(values({ kind, item: 'job:test1' }), 'en').ok, kind).toBe(true)
      expect(parseReport(values({ kind, item: '' }), 'en').ok, kind).toBe(true)
    }
  })

  it('shows that problem with the others at once', () => {
    expect(errorsOf({ kind: 'closed', item: institution, details: '', email: 'someone@' })).toEqual(
      { kind: 'kindJobOnly', details: 'detailsMissing', email: 'emailInvalid' },
    )
    // A missing kind is reported as missing.
    expect(errorsOf({ kind: '', item: institution })).toEqual({ kind: 'kindMissing' })
  })

  it('takes every kind when the item is malformed, since it is then ignored', () => {
    expect(parseReport(values({ kind: 'closed', item: 'institution:nope!' }), 'en')).toMatchObject({
      ok: true,
      data: { kind: 'closed', item: null },
    })
  })
})

describe('report form: details', () => {
  it('are required', () => {
    expect(errorsOf({ details: '' })).toEqual({ details: 'detailsMissing' })
    expect(errorsOf({ details: ' \r\n\t ' })).toEqual({ details: 'detailsMissing' })
  })

  it('are plain text of up to 2,000 characters, with line breaks counted once', () => {
    expect(parseReport(values({ details: 'x'.repeat(DETAILS_MAX) }), 'en').ok).toBe(true)
    expect(errorsOf({ details: 'x'.repeat(DETAILS_MAX + 1) })).toEqual({
      details: 'detailsTooLong',
    })
    expect(parseReport(values({ details: `${'x'.repeat(1998)}\r\ny` }), 'en').ok).toBe(true)
    expect(parseReport(values({ details: ' a\u0000b‮c \r\nd ' }), 'en')).toMatchObject({
      data: { details: 'abc \nd' },
    })
  })
})

describe('report form: email address', () => {
  it('is optional for every kind but personal rights', () => {
    for (const { value } of REPORT_KINDS.filter((kind) => kind.value !== 'personal-rights')) {
      expect(parseReport(values({ kind: value }), 'en'), value).toMatchObject({
        ok: true,
        data: { email: null },
      })
    }
  })

  it('is required for a personal-rights request, so that we can answer', () => {
    expect(errorsOf({ kind: 'personal-rights' })).toEqual({ email: 'emailRequired' })
    expect(errorsOf({ kind: 'personal-rights', email: '   ' })).toEqual({ email: 'emailRequired' })
    expect(
      parseReport(values({ kind: 'personal-rights', email: ' someone@example.org ' }), 'en'),
    ).toMatchObject({ ok: true, data: { kind: 'personal-rights', email: 'someone@example.org' } })
  })

  it('is checked whatever the kind, and every problem is shown at once', () => {
    expect(errorsOf({ email: 'someone@' })).toEqual({ email: 'emailInvalid' })
    expect(errorsOf({ email: `${'a'.repeat(EMAIL_MAX)}@example.org` })).toEqual({
      email: 'emailTooLong',
    })
    // A wrong address is reported as wrong, not as missing.
    expect(errorsOf({ kind: 'personal-rights', email: 'someone@' })).toEqual({
      email: 'emailInvalid',
    })
    expect(errorsOf({ kind: 'personal-rights', details: '' })).toEqual({
      details: 'detailsMissing',
      email: 'emailRequired',
    })
  })
})

describe('report form: item and language', () => {
  it('reads the item from its hidden input, and ignores a malformed one', () => {
    expect(parseReport(values(), 'en')).toMatchObject({
      data: { item: { type: 'job', shortId: 'test1' } },
    })
    expect(parseReport(values({ item: 'institution:k3f9a' }), 'en')).toMatchObject({
      data: { item: { type: 'institution', id: 'k3f9a' } },
    })
    for (const item of [
      '',
      'job:nope!',
      'event:test1',
      'job:test1; DROP TABLE reports',
      'institution:05dxps055; DROP TABLE reports',
    ]) {
      expect(parseReport(values({ item }), 'en'), item).toMatchObject({
        ok: true,
        data: { item: null },
      })
    }
  })

  it('stores the language of the form, English unless it is another site language', () => {
    expect(parseReport(values(), 'tr')).toMatchObject({ data: { locale: 'tr' } })
    expect(parseReport(values(), 'xx')).toMatchObject({ data: { locale: 'en' } })
  })
})

describe('reading the form', () => {
  it('reads text only; missing fields are empty', () => {
    const form = new FormData()
    form.set('kind', 'closed')
    form.set('details', new Blob(['not text']), 'details.txt')
    form.set('item', 'job:test1')
    form.set('reference_code', 'filled in by a program')
    expect(readReportValues(form)).toEqual({
      kind: 'closed',
      details: '',
      email: '',
      item: 'job:test1',
    })
    expect(readControls(form).honeypot).toBe('filled in by a program')
  })
})
