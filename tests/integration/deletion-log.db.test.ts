import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { purgeReports, purgeSuggestions, retireListings } from '@/jobs/maintenance/purgeRetention'
import { inTransaction } from '@/jobs/maintenance/task'
import { type MemberDb, createMember, saveJob } from '@/lib/members/store'

import { db, institution, job, rows, suggestion, testPayload, unique } from './helpers'

// What M4b's first step changes in the existing collections (D49), against a real, migrated
// database: deletions of suggestions and reports that a person asked for are written to the
// deletion log in their own transaction, the retention task's are not, and a job's saved items go
// with the job whichever way it is deleted.

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterAll(async () => {
  await payload?.destroy()
})

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const monthsAgo = (months: number) => {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString()
}

/** The logged actions for one record. */
const logged = async (collection: string, id: number) =>
  (
    await rows<{ action: string }>(
      payload,
      sql`select action from deletion_log
        where target_collection = ${collection} and target_id = ${id}`,
    )
  ).map((row) => row.action)

async function report(status: 'new' | 'closed' = 'new') {
  const created = await payload.create({
    collection: 'reports',
    data: {
      kind: 'wrong-fact',
      details: 'Fake data (integration test). A fact is wrong.',
      email: 'reporter@example.org',
      locale: 'en',
      status: 'new',
    },
    overrideAccess: true,
    depth: 0,
  })
  if (status === 'closed') {
    await payload.update({
      collection: 'reports',
      id: created.id,
      data: { status: 'in-progress' },
      depth: 0,
    })
    await payload.update({
      collection: 'reports',
      id: created.id,
      data: { status: 'closed', action: 'none' },
      depth: 0,
    })
  }
  return created.id
}

describe('the deletion log', () => {
  it('records a suggestion and a report deleted on request: their IDs, nothing else', async () => {
    const sent = await suggestion(payload, { email: 'requester@example.org', consent: true })
    const reported = await report()
    await payload.delete({ collection: 'submissions', id: sent.id, depth: 0 })
    await payload.delete({ collection: 'reports', id: reported, depth: 0 })
    expect(await logged('submissions', sent.id)).toEqual(['delete'])
    expect(await logged('reports', reported)).toEqual(['delete'])
    const [row] = await rows<Record<string, unknown>>(
      payload,
      sql`select * from deletion_log where target_collection = 'reports' and target_id = ${reported}`,
    )
    expect(Object.keys(row!).sort()).toEqual([
      'action',
      'at',
      'id',
      'target_collection',
      'target_id',
    ])
  })

  it('records nothing for a deletion that was rolled back', async () => {
    const sent = await suggestion(payload)
    await expect(
      inTransaction(payload, async (req) => {
        await payload.delete({ collection: 'submissions', id: sent.id, depth: 0, req })
        throw new Error('stopped')
      }),
    ).rejects.toThrow('stopped')
    expect((await payload.findByID({ collection: 'submissions', id: sent.id, depth: 0 })).id).toBe(
      sent.id,
    )
    expect(await logged('submissions', sent.id)).toEqual([])
  })

  it('leaves out the retention task’s deletions, which repeat themselves after a restore', async () => {
    const due = await suggestion(payload, { kind: 'event' })
    await rows(
      payload,
      sql`update submissions set email_purge_at = ${ago(1000)} where id = ${due.id}`,
    )
    const closed = await report('closed')
    await rows(payload, sql`update reports set purge_at = ${ago(1000)} where id = ${closed}`)

    await purgeSuggestions(payload, new Date())
    await purgeReports(payload, new Date())

    expect(
      await payload.find({
        collection: 'submissions',
        where: { id: { equals: due.id } },
        depth: 0,
      }),
    ).toMatchObject({ totalDocs: 0 })
    expect(await logged('submissions', due.id)).toEqual([])
    expect(await logged('reports', closed)).toEqual([])
  })
})

describe('saved items', () => {
  const savedJobs = async (memberId: number) =>
    (
      await rows<{ job_id: number | null }>(
        payload,
        sql`select job_id from saved_items where member_id = ${memberId} order by job_id`,
      )
    ).map((row) => row.job_id)

  async function member() {
    return createMember(
      db(payload) as unknown as MemberDb,
      { email: `${unique('member')}@example.org`, emailVerifiedBy: 'link' },
      new Date(),
    )
  }

  it('go with their job, whether an editor deletes a draft or the retention task a listing', async () => {
    const place = await institution(payload)
    const saver = await member()
    const draft = await job(payload, place.id, { status: 'draft' })
    const offline = await job(payload, place.id, {
      status: 'withdrawn',
      publishedAt: monthsAgo(15),
      withdrawnAt: monthsAgo(12),
    })
    const open = await job(payload, place.id)
    const store = db(payload) as unknown as MemberDb
    for (const saved of [draft, offline, open]) {
      expect(await saveJob(store, saver.id, saved.id, new Date())).toBe('saved')
    }

    await payload.delete({ collection: 'jobs', id: draft.id, depth: 0 })
    expect((await retireListings(payload, new Date())).retired).toBeGreaterThanOrEqual(1)

    // Only the open job's saved item is left; none lost its job and stayed behind.
    expect(await savedJobs(saver.id)).toEqual([open.id])
  })

  it('stay when the deletion of their job is refused', async () => {
    const place = await institution(payload)
    const saver = await member()
    const published = await job(payload, place.id)
    await saveJob(db(payload) as unknown as MemberDb, saver.id, published.id, new Date())
    await expect(
      payload.delete({ collection: 'jobs', id: published.id, depth: 0 }),
    ).rejects.toThrow()
    expect(await savedJobs(saver.id)).toEqual([published.id])
  })
})
