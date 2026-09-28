import { describe, expect, it } from 'vitest'

import { SUBMISSION_KINDS } from '@/lib/review/status'

import { NOTE_MAX } from './fields'
import { readControls } from './public-form'
import {
  type SuggestValues,
  parseSuggestion,
  readSuggestValues,
  urlProblem,
} from './suggest-schema'

const values = (overrides: Partial<SuggestValues> = {}): SuggestValues => ({
  url: 'https://www.example.org/jobs/123',
  kind: 'position',
  note: '',
  email: '',
  consent: false,
  ...overrides,
})

const errorsOf = (overrides: Partial<SuggestValues>, locale = 'en') => {
  const result = parseSuggestion(values(overrides), locale)
  return result.ok ? {} : result.errors
}

describe('suggestion form: address', () => {
  it('accepts an http or https address and keeps it as typed, trimmed', () => {
    for (const url of [
      'https://www.example.org/jobs/123',
      'http://example.org/positions?id=7#apply',
      'https://careers.example.org:8443/a/b/',
    ]) {
      const result = parseSuggestion(values({ url: `  ${url}\n` }), 'en')
      expect(result).toMatchObject({ ok: true, data: { url } })
    }
  })

  it('accepts internationalised domain names and paths', () => {
    for (const url of [
      'https://müller-institut.example/stellen/1',
      'https://例え.jp/求人/42',
      'https://xn--mller-kva.example/stellen/1',
      'https://üniversite.example.com.tr/ilan/nörobilim',
    ]) {
      expect(urlProblem(url), url).toBeNull()
    }
  })

  it('refuses other schemes, including javascript: and data:', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'ftp://example.org/jobs.txt',
      'mailto:jobs@example.org',
      'file:///etc/passwd',
    ]) {
      expect(urlProblem(url), url).toBe('urlScheme')
    }
  })

  it('refuses sign-in details in the address', () => {
    for (const url of [
      'https://user:password@example.org/jobs/1',
      'https://user@example.org/jobs/1',
      'https://:password@example.org/jobs/1',
    ]) {
      expect(urlProblem(url), url).toBe('urlCredentials')
    }
  })

  it('refuses what is not a full address of a public page', () => {
    for (const url of [
      'www.example.org/jobs/1',
      'example.org',
      'not an address',
      'https://',
      'https://localhost/jobs',
      'http://intranet/jobs',
    ]) {
      expect(urlProblem(url), url).toBe('urlInvalid')
    }
    expect(errorsOf({ url: '   ' })).toEqual({ url: 'urlMissing' })
  })

  it('refuses addresses the URL parser would silently change, since they are stored as typed', () => {
    for (const url of [
      // NUL cannot be stored in PostgreSQL; the parser drops a leading one and encodes an inner one.
      '\u0000https://careers.example.org/nul-lead',
      'https://careers.example.org/nul\u0000mid',
      '\u0001https://careers.example.org/ctrl',
      'ht\ttps://careers.example.org/tab',
      'https://careers.example.org/line\nbreak',
      'https://careers.example.org/with space',
      'https://careers.example.org/nbsp\u00a0x',
      // Opens careers.example.org, but reads like an address at evil.example.
      'https://careers.example.org\\@evil.example/x',
      'https:\\\\careers.example.org\\jobs',
      // Shown reordered in the admin.
      'https://careers.example.org/jobs/\u202Egnp.exe',
      'https://careers.example.org/\u2066x\u2069',
    ]) {
      expect(urlProblem(url), JSON.stringify(url)).toBe('urlInvalid')
      expect(parseSuggestion(values({ url }), 'en').ok, JSON.stringify(url)).toBe(false)
    }
  })

  it('refuses addresses longer than 2,000 characters, also once percent-encoded', () => {
    const base = 'https://example.org/'
    expect(urlProblem(base + 'a'.repeat(2000 - base.length))).toBeNull()
    expect(urlProblem(base + 'a'.repeat(2001 - base.length))).toBe('urlTooLong')
    // 700 characters as typed; each "ü" is 6 characters in the canonical form (%C3%BC).
    expect(urlProblem(base + 'ü'.repeat(680))).toBe('urlTooLong')
  })
})

describe('suggestion form: content type, note, email and consent', () => {
  it('accepts every content type of the Submissions collection, and nothing else', () => {
    for (const { value } of SUBMISSION_KINDS) {
      expect(parseSuggestion(values({ kind: value }), 'en').ok, value).toBe(true)
    }
    expect(errorsOf({ kind: '' })).toEqual({ kind: 'kindMissing' })
    expect(errorsOf({ kind: 'job' })).toEqual({ kind: 'kindMissing' })
  })

  it('keeps a note of up to 500 characters as plain text', () => {
    expect(parseSuggestion(values({ note: 'x'.repeat(NOTE_MAX) }), 'en').ok).toBe(true)
    expect(errorsOf({ note: 'x'.repeat(NOTE_MAX + 1) })).toEqual({ note: 'noteTooLong' })
    // Browsers send line breaks as CRLF but count them as one character.
    expect(parseSuggestion(values({ note: `${'x'.repeat(498)}\r\ny` }), 'en').ok).toBe(true)
    // Markup is text: stored as typed, and shown encoded (React escapes it).
    const html = '<b>Deadline</b> <script>alert(1)</script>'
    expect(parseSuggestion(values({ note: html }), 'en')).toMatchObject({ data: { note: html } })
    expect(parseSuggestion(values({ note: ' \n ' }), 'en')).toMatchObject({ data: { note: null } })
  })

  it('removes control characters and text-reordering characters from the note', () => {
    expect(parseSuggestion(values({ note: 'a\u0000b\u202Ec' }), 'en')).toMatchObject({
      data: { note: 'abc' },
    })
  })

  it('stores an email address only with consent, and asks rather than dropping it', () => {
    expect(
      parseSuggestion(values({ email: ' someone@example.org ', consent: true }), 'en'),
    ).toMatchObject({ ok: true, data: { email: 'someone@example.org', consentToContact: true } })
    expect(errorsOf({ email: 'someone@example.org', consent: false })).toEqual({
      consent: 'consentMissing',
    })
    expect(errorsOf({ email: '', consent: true })).toEqual({ email: 'emailMissing' })
    expect(parseSuggestion(values(), 'en')).toMatchObject({
      data: { email: null, consentToContact: false },
    })
  })

  it('refuses email addresses that cannot be delivered', () => {
    for (const email of [
      'someone@',
      'someone',
      'a b@example.org',
      'a..b@example.org',
      '"a"@x.org',
    ]) {
      expect(errorsOf({ email, consent: true }), email).toEqual({ email: 'emailInvalid' })
    }
    const long = `${'a'.repeat(250)}@example.org`
    expect(errorsOf({ email: long, consent: true })).toEqual({ email: 'emailTooLong' })
  })

  it('reports every problem at once, the first one of each field', () => {
    expect(
      errorsOf({ url: 'javascript:alert(1)', kind: '', note: 'x'.repeat(600), email: 'a@b.org' }),
    ).toEqual({
      url: 'urlScheme',
      kind: 'kindMissing',
      note: 'noteTooLong',
      consent: 'consentMissing',
    })
  })

  it('stores the language of the form, English unless it is another site language', () => {
    expect(parseSuggestion(values(), 'tr')).toMatchObject({ data: { locale: 'tr' } })
    expect(parseSuggestion(values(), 'xx')).toMatchObject({ data: { locale: 'en' } })
    expect(parseSuggestion(values(), '')).toMatchObject({ data: { locale: 'en' } })
  })
})

describe('reading the form', () => {
  it('reads text only; an unticked checkbox and missing fields are empty', () => {
    const form = new FormData()
    form.set('url', 'https://www.example.org/jobs/1')
    form.set('note', new Blob(['not text']), 'note.txt')
    form.set('reference_code', 'filled in by a program')
    expect(readSuggestValues(form)).toEqual({
      url: 'https://www.example.org/jobs/1',
      kind: '',
      note: '',
      email: '',
      consent: false,
    })
    expect(readControls(form)).toEqual({
      locale: '',
      altcha: '',
      honeypot: 'filled in by a program',
    })
    form.set('consent', 'yes')
    expect(readSuggestValues(form).consent).toBe(true)
  })
})
