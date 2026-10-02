import { describe, expect, it } from 'vitest'

import { REJECTION_REASONS } from '@/lib/review/status'

import { DATA_REQUEST_KINDS } from '@/lib/data-requests/kinds'

import {
  type NotAddedReason,
  accountDeletedEmail,
  dataDeletedEmail,
  dataRequestConfirmEmail,
  emailLocale,
  inactivityWarningEmail,
  newsletterConfirmEmail,
  newsletterWelcomeEmail,
  privacyUrl,
  reportAcknowledgement,
  siteUrl,
  suggestionEmail,
  verifyEmailEmail,
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

describe('verifyEmailEmail', () => {
  const LINK = `https://gliagora.com/en/sign-in/link/?token=${'a'.repeat(43)}`

  it('says that someone signed in asked for it, with the link, and what to do if it was not you', () => {
    const email = verifyEmailEmail({ locale: 'en', link: LINK })
    expect(email.subject).toBe('Add this email address to a Gliagora account?')
    expect(email.text).toContain(
      `Someone signed in to a Gliagora account asked to add this address to that account. If it was you, open this link in the browser where you are signed in:\n${LINK}\n`,
    )
    expect(email.text).toContain('The link works for 24 hours and only once.')
    expect(email.text).toContain('If it was not you, ignore this email: nothing changes.')
    expect(email.text).toContain('Gliagora | Neuroscience\nhttps://gliagora.com/')
  })

  it('names no account and no other address', () => {
    const { text } = verifyEmailEmail({ locale: 'en', link: LINK })
    expect(text).not.toMatch(/@(?!gliagora\.com)/)
  })

  it('does not tell the reader the account is theirs: anyone can type their address', () => {
    expect(verifyEmailEmail({ locale: 'en', link: LINK }).subject).not.toMatch(/\byour\b/i)
    expect(verifyEmailEmail({ locale: 'tr', link: LINK }).subject).not.toMatch(/hesabınız/i)
  })

  it('has its Turkish text', () => {
    expect(verifyEmailEmail({ locale: 'tr', link: LINK }).subject).toBe(
      'Bu e-posta adresi bir Gliagora hesabına eklensin mi?',
    )
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

describe('accountDeletedEmail', () => {
  it('confirms the deletion and says what stays, in plain text', () => {
    const email = accountDeletedEmail({ locale: 'en' })
    expect(email.subject).toBe('Your Gliagora account has been deleted')
    expect(email.text.startsWith('Hello,\n\nAs you asked, we have deleted your Gliagora')).toBe(
      true,
    )
    expect(email.text).toContain('for 2 years')
    expect(email.text).toContain('up to 6 months')
    expect(email.text).toContain('https://gliagora.com/en/legal/privacy/')
    expect(email.text.endsWith('Gliagora | Neuroscience\nhttps://gliagora.com/\n')).toBe(true)
    // No link that signs in or acts, and no address but ours.
    expect(email.text).not.toContain('/en/sign-in/')
    expect(email.text).not.toMatch(/@(?!gliagora\.com)/)
  })

  it('says that the Glia Notes subscription ended with it, only when one did', () => {
    const line = 'Your Glia Notes subscription has ended too'
    expect(accountDeletedEmail({ locale: 'en' }).text).not.toContain(line)
    const email = accountDeletedEmail({ locale: 'en', newsletterRemoved: true })
    expect(email.text).toContain(`${line}: we have deleted its address from our mailing list.`)
    expect(accountDeletedEmail({ locale: 'tr', newsletterRemoved: true }).text).toContain(
      'Glia Notes aboneliğiniz de sona erdi',
    )
  })

  it('has a Turkish draft that points to the KVKK notice', () => {
    const email = accountDeletedEmail({ locale: 'tr' })
    expect(email.subject).toBe('Gliagora hesabınız silindi')
    expect(email.locale).toBe('tr')
    expect(email.text).toContain('https://gliagora.com/tr/legal/kvkk-aydinlatma-metni/')
  })
})

describe('inactivityWarningEmail', () => {
  const day = '2026-10-30'

  it('names the day before which to sign in, with a plain sign-in link', () => {
    const email = inactivityWarningEmail({ locale: 'en', day })
    expect(email.subject).toBe('Your Gliagora account will be deleted')
    expect(email.text).toContain(
      'You have not used your Gliagora | Neuroscience account for 2 years. To keep it, sign in before 30 Oct 2026:\nhttps://gliagora.com/en/sign-in/\n',
    )
    expect(email.text).toContain('we will delete the account on that day or soon after')
    // Deleting the account for inactivity does not end Glia Notes (PLAN §22.2, question 11).
    expect(email.text).toContain('Glia Notes is not part of this: if you receive it, it continues')
    expect(email.text).toContain('https://gliagora.com/en/legal/privacy/')
    // The link carries nothing: no token, no address.
    expect(email.text).not.toMatch(/token=|\?next=/)
    expect(email.text).not.toMatch(/@(?!gliagora\.com)/)
  })

  it('writes the day as given, whatever the server’s time zone', () => {
    expect(inactivityWarningEmail({ locale: 'en', day: '2026-10-31' }).text).toContain(
      'sign in before 31 Oct 2026:',
    )
    expect(inactivityWarningEmail({ locale: 'tr', day }).text).toContain(
      '30 Eki 2026 tarihinden önce oturum açın:',
    )
  })
})

describe('dataRequestConfirmEmail', () => {
  const LINK = `https://gliagora.com/en/legal/data-requests/confirm/?token=${'b'.repeat(43)}`

  it('acknowledges the request, names its kind and asks to confirm it with the link', () => {
    const email = dataRequestConfirmEmail({ locale: 'en', kind: 'deletion', link: LINK })
    expect(email.subject).toBe('Confirm your request to Gliagora')
    expect(email.text).toContain(
      'We have received a request to delete the data that Gliagora | Neuroscience holds under this email address.',
    )
    expect(email.text).toContain(
      `We act on it only after you confirm that it is yours. To confirm it, open this link:\n${LINK}\n`,
    )
    expect(email.text).toContain('The link works for 24 hours and only once.')
    expect(email.text).toContain('If you did not send this request, ignore this email')
    expect(email.text).toContain('for 60 days')
    expect(email.text.endsWith('Gliagora | Neuroscience\nhttps://gliagora.com/\n')).toBe(true)
  })

  it('has a text for every kind, in English and Turkish, and repeats nothing the person wrote', () => {
    for (const locale of ['en', 'tr'] as const) {
      const texts = new Set<string>()
      for (const { value } of DATA_REQUEST_KINDS) {
        const { text } = dataRequestConfirmEmail({ locale, kind: value, link: LINK })
        expect(text).toContain(LINK)
        // No address but ours: not even the one the email goes to.
        expect(text).not.toMatch(/@(?!gliagora\.com)/)
        texts.add(text)
      }
      expect(texts.size).toBe(DATA_REQUEST_KINDS.length)
    }
    expect(dataRequestConfirmEmail({ locale: 'tr', kind: 'access', link: LINK }).subject).toBe(
      "Gliagora'ya gönderdiğiniz talebi onaylayın",
    )
  })
})

describe('dataDeletedEmail', () => {
  const none = {
    suggestionsDeleted: 0,
    accountDeleted: 0,
    newsletterRemoved: 0,
    reportAddressesCleared: 0,
    personalRightsReportsKept: 0,
  } as const

  it('lists what was deleted, from the counts', () => {
    const email = dataDeletedEmail({
      locale: 'en',
      outcome: {
        ...none,
        suggestionsDeleted: 2,
        accountDeleted: 1,
        newsletterRemoved: 1,
        reportAddressesCleared: 1,
      },
    })
    expect(email.subject).toBe('Your data has been deleted from Gliagora')
    expect(email.text).toContain(
      'As you confirmed, we have deleted the data that Gliagora | Neuroscience held under this email address:\n' +
        '- 2 suggestions you sent, with their links and notes\n' +
        '- your Gliagora account, with your saved positions and settings\n' +
        '- your Glia Notes subscription\n' +
        '- your address on 1 problem report or correction you sent\n',
    )
    expect(email.text).not.toContain('personal rights')
    expect(email.text).toContain('for 2 years')
    expect(email.text).toContain('up to 6 months')
    expect(email.text).toContain('https://gliagora.com/en/legal/privacy/')
    expect(email.text).not.toMatch(/@(?!gliagora\.com)/)
  })

  it('says which requests about personal rights keep the address, and why', () => {
    const { text } = dataDeletedEmail({
      locale: 'en',
      outcome: { ...none, suggestionsDeleted: 1, personalRightsReportsKept: 2 },
    })
    expect(text).toContain('- 1 suggestion you sent, with its link and note\n')
    expect(text).toContain(
      'We keep this address on 2 requests about your personal rights that you sent us: we handle such requests under Law No. 5651',
    )
  })

  it('says so when nothing was found', () => {
    const { text } = dataDeletedEmail({ locale: 'en', outcome: none })
    expect(text).toContain(
      'We found no suggestion, account, newsletter subscription or problem report with it',
    )
    expect(text).not.toContain('\n- ')
  })

  it('names a newsletter subscription that was all there was (from M2)', () => {
    const { text } = dataDeletedEmail({ locale: 'en', outcome: { ...none, newsletterRemoved: 1 } })
    expect(text).toContain('held under this email address:\n- your Glia Notes subscription\n')
    expect(text).not.toContain('We found no')
  })

  it('has a Turkish draft that points to the KVKK notice', () => {
    const email = dataDeletedEmail({ locale: 'tr', outcome: { ...none, accountDeleted: 1 } })
    expect(email.subject).toBe("Verileriniz Gliagora'dan silindi")
    expect(email.text).toContain('- Gliagora hesabınız')
    expect(email.text).toContain('https://gliagora.com/tr/legal/kvkk-aydinlatma-metni/')
  })
})

describe('newsletterConfirmEmail', () => {
  const link = 'https://gliagora.com/en/newsletter/confirm/?token=' + 'a'.repeat(43)

  it('carries the link for 7 days and says nothing happens without it', () => {
    const email = newsletterConfirmEmail({ locale: 'en', link })
    expect(email.subject).toBe('Confirm your subscription to Glia Notes')
    expect(email.text).toContain(`press the button:\n${link}\n`)
    expect(email.text).toContain('The link works for 7 days and only once.')
    expect(email.text).toContain('nothing happens, and you will not be subscribed')
    expect(email.text).toContain('delete it after 7 days')
    expect(email.text.startsWith('Hello,\n\n')).toBe(true)
    expect(email.text.endsWith('Gliagora | Neuroscience\nhttps://gliagora.com/\n')).toBe(true)
    // An email that asks for a confirmation has no unsubscribe headers: nobody is subscribed yet.
    expect(email.unsubscribeUrl).toBeUndefined()
  })

  it('has a Turkish text', () => {
    const email = newsletterConfirmEmail({ locale: 'tr', link })
    expect(email.locale).toBe('tr')
    expect(email.subject).toBe('Glia Notes aboneliğinizi onaylayın')
    expect(email.text).toContain(link)
    expect(email.text).toContain('7 gün')
    expect(email.text.startsWith('Merhaba,\n\n')).toBe(true)
  })
})

describe('newsletterWelcomeEmail', () => {
  const uuid = '0b2c6f8e-3f0a-4c1e-9d55-6f1d2a7b8c9d'
  const unsubscribePage = `https://gliagora.com/en/newsletter/unsubscribe/?id=7&s=${uuid}`
  const unsubscribeUrl = `https://gliagora.com/en/newsletter/unsubscribe/use/?id=7&s=${uuid}`

  it('says the first issue comes with the launch, how to unsubscribe and what is kept', () => {
    const email = newsletterWelcomeEmail({ locale: 'en', unsubscribePage, unsubscribeUrl })
    expect(email.subject).toBe('You are subscribed to Glia Notes')
    expect(email.text).toContain('The first issue arrives with the public launch of Gliagora.')
    expect(email.text).toContain(`press the button, and your address is deleted at once.`)
    expect(email.text).toContain(`${unsubscribePage}\n`)
    expect(email.text).toContain('for 3 years after you unsubscribe')
    expect(email.text).toContain('https://gliagora.com/en/legal/privacy/')
    // The one-click address goes into the headers (deliver.ts), not into the text.
    expect(email.unsubscribeUrl).toBe(unsubscribeUrl)
    expect(email.text).not.toContain('/unsubscribe/use/')
  })

  it('has a Turkish text, which links the KVKK notice', () => {
    const email = newsletterWelcomeEmail({ locale: 'tr', unsubscribePage, unsubscribeUrl })
    expect(email.subject).toBe("Glia Notes'a abone oldunuz")
    expect(email.text).toContain(unsubscribePage)
    expect(email.text).toContain('https://gliagora.com/tr/legal/kvkk-aydinlatma-metni/')
    expect(email.unsubscribeUrl).toBe(unsubscribeUrl)
  })
})
