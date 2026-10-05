import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { MemberRecord } from '@/lib/members/store'

import { DigestSettings } from './AccountSettings'
import { NoEmailNotice } from './NoEmailNotice'

// The account page's notice for an account without an email address (NoEmailNotice.tsx), and the
// Glia Notes section's line for it (AccountSettings.tsx): a link to the address form only while
// the form is offered, the same words without it otherwise (the end-to-end tests run with a mail
// server and the spam check, so they see only the first).

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const messages = (await import('../../../messages/en.json')).default
  return {
    getTranslations: async (options: string | { namespace: string }) =>
      createTranslator({
        locale: 'en',
        messages,
        namespace: (typeof options === 'string' ? options : options.namespace) as 'account',
      }),
  }
})

const member: MemberRecord = {
  id: 7,
  email: null,
  emailVerifiedAt: null,
  emailVerifiedBy: null,
  googleId: null,
  orcidId: '9999-0000-0000-0019',
  displayName: null,
  digestOptIn: false,
  digestChangedAt: null,
  digestConsentVersion: null,
  digestConsentSource: null,
  digestRequestedAt: null,
  digestSyncedAt: null,
  digestSubscriber: null,
  digestAdoptCheckAt: null,
  lastSeenAt: new Date('2026-10-01T08:00:00Z'),
  deletionWarnedAt: null,
  warningRefusedAt: null,
  createdAt: new Date('2026-09-30T10:00:00Z'),
}

describe('NoEmailNotice', () => {
  it('links to the address form while it is offered', async () => {
    const html = renderToStaticMarkup(await NoEmailNotice({ canAddEmail: true }))
    expect(html).toContain('after 24 months and 30 days without activity')
    expect(html).toContain('<a href="#email">add an email address</a>')
  })

  it('says the same without a link while it is not', async () => {
    const html = renderToStaticMarkup(await NoEmailNotice({ canAddEmail: false }))
    expect(html).toContain('after 24 months and 30 days without activity')
    expect(html).toContain('adding one will be possible here later')
    expect(html).not.toContain('<a')
  })
})

describe('DigestSettings without an address', () => {
  it('links to the address form only while it is offered', async () => {
    const offered = renderToStaticMarkup(await DigestSettings({ member, canAddEmail: true }))
    expect(offered).toContain('href="#email"')
    const later = renderToStaticMarkup(await DigestSettings({ member, canAddEmail: false }))
    expect(later).not.toContain('href="#email"')
  })
})
