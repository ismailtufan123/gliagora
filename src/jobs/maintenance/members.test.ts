import { describe, expect, it } from 'vitest'

import { warningDelivery } from './cleanInactiveMembers'
import { FINAL_EMAILS, type RequestRow } from './sendRequestEmails'

// The member tasks' rules that need no database (M4b, D49): what the mail server's answer to an
// inactivity warning means (the M4b design §7.7), and which deletions get a final email. The tasks
// themselves run against PostgreSQL and Mailpit in tests/integration/members.db.test.ts.

describe('warningDelivery', () => {
  it('counts a warning as given only when the server accepted it', () => {
    expect(warningDelivery({ status: 'sent', reply: { code: 250, enhanced: '2.0.0' } })).toBe(
      'accepted',
    )
  })

  it('reads a recipient refused at RCPT TO as "no such address" only with a recipient status', () => {
    for (const enhanced of ['5.1.0', '5.1.1', '5.1.2', '5.1.3', '5.1.6', '5.1.10']) {
      expect(
        warningDelivery({ status: 'refused', reply: { code: 550, enhanced, command: 'RCPT TO' } }),
      ).toBe('no-such-address')
    }
    // Other statuses at RCPT TO are about this message only.
    for (const enhanced of ['5.1.4', '5.1.5', '5.2.1', '5.7.1']) {
      expect(
        warningDelivery({ status: 'refused', reply: { code: 550, enhanced, command: 'RCPT TO' } }),
      ).toBe('refused')
    }
  })

  it('never reads a refusal at another step, or with no step known, as "no such address"', () => {
    // The message refused after DATA (a spam filter, a quota checked late).
    expect(
      warningDelivery({
        status: 'refused',
        reply: { code: 550, enhanced: '5.1.1', command: 'DATA' },
      }),
    ).toBe('refused')
    expect(warningDelivery({ status: 'refused', reply: { code: 550, enhanced: '5.1.1' } })).toBe(
      'refused',
    )
  })

  it('stops the run when the server refuses our sender: every message would be refused', () => {
    // At MAIL FROM, whatever the status (Postfix: 550 5.1.0 Sender address rejected).
    for (const reply of [
      { code: 550, enhanced: '5.1.0' },
      { code: 553, enhanced: '5.1.8' },
      { code: 550, enhanced: '5.7.1' },
      { code: 550 },
    ]) {
      expect(
        warningDelivery({ status: 'refused', reply: { ...reply, command: 'MAIL FROM' } }),
      ).toBe('try-later')
    }
    // The sender statuses at any step (Exchange Online: 550 5.1.8 Access denied, bad outbound
    // sender; Postfix checks the sender at RCPT TO by default).
    for (const enhanced of ['5.1.7', '5.1.8']) {
      for (const command of ['RCPT TO', 'DATA', undefined] as const) {
        expect(
          warningDelivery({ status: 'refused', reply: { code: 550, enhanced, command } }),
        ).toBe('try-later')
      }
    }
  })

  it('stops on a temporary refusal (4xx) or a server out of reach, whatever the enhanced status', () => {
    expect(warningDelivery({ status: 'refused', reply: { code: 451 } })).toBe('try-later')
    expect(warningDelivery({ status: 'refused', reply: { code: 452, enhanced: '4.2.2' } })).toBe(
      'try-later',
    )
    expect(warningDelivery({ status: 'refused', reply: { code: 450, enhanced: '5.1.1' } })).toBe(
      'try-later',
    )
    expect(warningDelivery({ status: 'unavailable', error: 'Error ECONNECTION' })).toBe('try-later')
    expect(warningDelivery({ status: 'unavailable' })).toBe('try-later')
  })

  it('skips any other refusal: a full mailbox, a policy, or no code at all', () => {
    expect(warningDelivery({ status: 'refused', reply: { code: 552, enhanced: '5.2.2' } })).toBe(
      'refused',
    )
    expect(warningDelivery({ status: 'refused', reply: { code: 550, enhanced: '5.7.1' } })).toBe(
      'refused',
    )
    expect(warningDelivery({ status: 'refused', reply: { code: 550 } })).toBe('refused')
    expect(warningDelivery({ status: 'refused' })).toBe('refused')
  })
})

describe('FINAL_EMAILS', () => {
  const row = (source: RequestRow['source'], locale = 'en'): RequestRow => ({
    id: 1,
    email: 'member@example.org',
    source,
    locale,
    outcome: { accountDeleted: 1 },
  })

  it('has the account deletion’s email, in the record’s language', () => {
    expect(FINAL_EMAILS.account?.(row('account')).subject).toBe(
      'Your Gliagora account has been deleted',
    )
    expect(FINAL_EMAILS.account?.(row('account', 'tr')).locale).toBe('tr')
    expect(FINAL_EMAILS.account?.(row('account', 'xx')).locale).toBe('en')
    // A Glia Notes subscription that ended with the account is named (M2), only then.
    expect(FINAL_EMAILS.account?.(row('account')).text).not.toContain('Glia Notes')
    expect(
      FINAL_EMAILS.account?.({
        ...row('account'),
        outcome: { accountDeleted: 1, newsletterRemoved: 1 },
      }).text,
    ).toContain('Your Glia Notes subscription has ended too')
  })

  it('sends nothing for requests editors record and answer themselves', () => {
    expect(FINAL_EMAILS.email).toBeUndefined()
  })
})
