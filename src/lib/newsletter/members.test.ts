import { describe, expect, it } from 'vitest'

import { MemberStoreError } from '@/lib/members/store'

import { ListmonkError } from './listmonk'
import { stopsRun } from './members'
import { NewsletterStoreError } from './store'

// The members' sync (M2, D50): which failures stop a run of `syncGliaNotes`. The sync itself runs
// against a real listmonk and database in tests/integration/glia-notes-members.db.test.ts.

describe('stopsRun', () => {
  it('stops when listmonk cannot answer now, or the database failed', () => {
    for (const error of [
      new ListmonkError('unreachable'),
      new ListmonkError('timeout'),
      new ListmonkError('invalid'),
      new ListmonkError('status', 500),
      new ListmonkError('status', 503),
      new NewsletterStoreError('57P01'),
      new MemberStoreError('08006'),
      new Error('connection lost'),
    ]) {
      expect(stopsRun(error), error.message).toBe(true)
    }
  })

  it('goes on after a refusal that concerns one member', () => {
    for (const error of [
      new ListmonkError('status', 400),
      new ListmonkError('status', 403),
      new ListmonkError('status', 409),
      new ListmonkError('conflict', 409),
      new NewsletterStoreError('invalid', 'version'),
      new MemberStoreError('invalid', 'email'),
    ]) {
      expect(stopsRun(error), error.message).toBe(false)
    }
  })
})
