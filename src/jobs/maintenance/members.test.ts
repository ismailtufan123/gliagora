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

  it('reads 5.1.x as "no such address"', () => {
    for (const enhanced of ['5.1.0', '5.1.1', '5.1.10']) {
      expect(warningDelivery({ status: 'refused', reply: { code: 550, enhanced } })).toBe(
        'no-such-address',
      )
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
  })

  it('sends nothing for requests editors record and answer themselves', () => {
    expect(FINAL_EMAILS.email).toBeUndefined()
  })
})
