import type { Payload } from 'payload'

import { jobForSaving } from '@/lib/records'

import type { SaveStore } from './saved'
import { memberDb, saveJob, unsaveJob } from './store'

// The database behind saving positions (src/lib/members/saved.ts): the job by its short ID through
// Payload's local API (any status: the caller decides whether it is public), and the saved items
// in SQL (src/lib/members/store.ts), where a member's row is locked while the 500 are counted.

export function saveStore(payload: Payload, now: Date): SaveStore {
  const db = memberDb(payload)
  return {
    now,
    job: async (shortId) => {
      const job = await jobForSaving(shortId)
      return job
        ? {
            id: job.id,
            status: job.status,
            deadlineKind: job.deadlineKind,
            deadlineAt: job.deadlineAt,
            expiredAt: job.expiredAt,
            withdrawnAt: job.withdrawnAt,
          }
        : null
    },
    save: (memberId, jobId) => saveJob(db, memberId, jobId, now),
    unsave: (memberId, jobId) => unsaveJob(db, memberId, jobId),
  }
}
