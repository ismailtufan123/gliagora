import { describe, expect, it } from 'vitest'

import { REJECTION_REASONS } from '@/lib/review/status'

import {
  type NotAddedReason,
  emailLocale,
  privacyUrl,
  reportAcknowledgement,
  siteUrl,
  suggestionEmail,
} from './messages'

const URL_SENT = 'https://www.example.org/jobs/48213?utm_source=list'
const JOB_PATH = '/en/jobs/phd-position-in-glia-k3f9a/'
const INSTITUTION_PATH = '/en/institutions/example-institute-of-neuroscience-k3f9a/'

describe('suggestionEmail', () => {
  it('tells that a suggestion was published, with the link sent and the Gliagora link', () => {
    const email = suggestionEmail({
      locale: 'en',
      url: URL_SENT,
      outcome: { kind: 'published', jobPath: JOB_PATH },
    })
    expect(email.subject).toBe('Your suggestion is now on Gliagora')
    expect(email.text).toContain(`You suggested this page:\n${URL_SENT}\n`)
    expect(email.text).toContain(
      `published it on Gliagora:\nhttps://gliagora.com/en/jobs/phd-position-in-glia-k3f9a/\n`,
    )
    expect(email.text).toContain('90 days after our decision')
    expect(email.text).toContain('the only email we send you about this suggestion')
    expect(email.text).toContain('https://gliagora.com/en/legal/privacy/')
    expect(email.text).toContain('hello@gliagora.com')
    expect(email.text.startsWith('Hello,\n\n')).toBe(true)
    expect(email.text.endsWith('Gliagora | Neuroscience\nhttps://gliagora.com/\n')).toBe(true)
  })

  it('gives a plain reason for every decision that is not spam', () => {
    const reasons: NotAddedReason[] = [
      'duplicate',
      ...REJECTION_REASONS.map(({ value }) => value).filter(
        (value): value is Exclude<typeof value, 'spam'> => value !== 'spam',
      ),
    ]
    const texts = new Set<string>()
    for (const locale of ['en', 'tr'] as const) {
      for (const reason of reasons) {
        const email = suggestionEmail({
          locale,
          url: URL_SENT,
          outcome: { kind: 'not-added', reason },
        })
        expect(email.text).toContain(URL_SENT)
        expect(email.text).not.toContain('https://gliagora.com/en/jobs/')
        texts.add(email.text)
      }
    }
    // Each reason reads differently.
    expect(texts.size).toBe(reasons.length * 2)
    const closed = suggestionEmail({
      locale: 'en',
      url: URL_SENT,
      outcome: { kind: 'not-added', reason: 'closed' },
    })
    expect(closed.subject).toBe('Your suggestion to Gliagora')
    expect(closed.text).toContain(
      'We have decided not to add it to Gliagora. The position had already closed',
    )
  })

  it('writes in the language of the form, and points Turkish readers to the KVKK notice', () => {
    const email = suggestionEmail({
      locale: 'tr',
      url: URL_SENT,
      outcome: { kind: 'published', jobPath: JOB_PATH },
    })
    expect(email.locale).toBe('tr')
    expect(email.subject).toBe("Öneriniz artık Gliagora'da")
    expect(email.text.startsWith('Merhaba,')).toBe(true)
    expect(email.text).toContain('90 gün sonra sileriz')
    expect(email.text).toContain('https://gliagora.com/tr/legal/kvkk-aydinlatma-metni/')
  })
})

describe('reportAcknowledgement', () => {
  it('confirms a report and names only the page it is about', () => {
    const email = reportAcknowledgement({
      locale: 'en',
      kind: 'wrong-fact',
      itemPath: JOB_PATH,
    })
    expect(email.subject).toBe('We have received your report')
    expect(email.text).toContain(
      'It is about this page:\nhttps://gliagora.com/en/jobs/phd-position-in-glia-k3f9a/',
    )
    expect(email.text).toContain('We check the item against the original posting')
    expect(email.text).toContain('2 years after we close it')
    expect(email.text).not.toContain('24 hours')
  })

  it('names an institution page the same way (D40)', () => {
    const email = reportAcknowledgement({
      locale: 'tr',
      kind: 'personal-rights',
      itemPath: INSTITUTION_PATH,
    })
    expect(email.text).toContain(
      '\nhttps://gliagora.com/en/institutions/example-institute-of-neuroscience-k3f9a/\n',
    )
    expect(email.text).toContain('24 saat içinde')
  })

  it('checks a report about an institution against its website and ROR record, not a posting (D40)', () => {
    const en = reportAcknowledgement({
      locale: 'en',
      kind: 'wrong-fact',
      itemPath: INSTITUTION_PATH,
    })
    expect(en.subject).toBe('We have received your report')
    expect(en.text).toContain('We check the institution’s details against its own website')
    expect(en.text).toContain('Research Organization Registry (ROR)')
    expect(en.text).not.toContain('original posting')
    const tr = reportAcknowledgement({
      locale: 'tr',
      kind: 'broken-link',
      itemPath: INSTITUTION_PATH,
    })
    expect(tr.text).toContain('Kurumun bilgilerini kendi web sitesiyle')
    expect(tr.text).not.toContain('asıl ilan')
    // A general report, and one from any other page, keep the posting's wording.
    for (const itemPath of [null, '/en/institutions/', '/en/report/']) {
      const general = reportAcknowledgement({ locale: 'en', kind: 'other', itemPath })
      expect(general.text, String(itemPath)).toContain('against the original posting')
    }
  })

  it('tells a personal-rights request that we answer within 24 hours and usually decide within 72', () => {
    const email = reportAcknowledgement({
      locale: 'en',
      kind: 'personal-rights',
      itemPath: null,
    })
    expect(email.subject).toBe('We have received your request')
    expect(email.text).toContain('your request about your personal rights')
    expect(email.text).toContain('within 24 hours')
    expect(email.text).toContain('within 72 hours')
    expect(email.text).not.toContain('It is about this page')
    expect(email.text).toContain('We keep your request, with your email address, for 2 years')
  })

  it('leaves out an item address that is not a path on the site', () => {
    const email = reportAcknowledgement({
      locale: 'tr',
      kind: 'other',
      itemPath: 'https://elsewhere.example.org/',
    })
    expect(email.text).not.toContain('elsewhere.example.org')
    expect(email.subject).toBe('Bildiriminizi aldık')
  })
})

describe('helpers', () => {
  it('reads the locale of a form, English when unknown', () => {
    expect(emailLocale('tr')).toBe('tr')
    expect(emailLocale('en')).toBe('en')
    expect(emailLocale('de')).toBe('en')
    expect(emailLocale(null)).toBe('en')
  })

  it('makes absolute addresses on the site', () => {
    expect(siteUrl('/en/jobs/')).toBe('https://gliagora.com/en/jobs/')
    expect(privacyUrl('en')).toBe('https://gliagora.com/en/legal/privacy/')
    expect(privacyUrl('tr')).toBe('https://gliagora.com/tr/legal/kvkk-aydinlatma-metni/')
  })
})
