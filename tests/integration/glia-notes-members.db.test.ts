import { sql } from '@payloadcms/db-postgres'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyDeletionLog } from '@/jobs/maintenance/applyDeletionLog'
import { cleanInactiveMembers } from '@/jobs/maintenance/cleanInactiveMembers'
import { checkGliaNotesMembers, syncGliaNotes } from '@/jobs/maintenance/syncGliaNotes'
import { confirmDataRequest } from '@/lib/data-requests/confirm'
import { recordDataRequest } from '@/lib/data-requests/record'
import { deleteOwnAccount } from '@/lib/members/account-deletion'
import { orcidCheckCharacter } from '@/lib/members/orcid-id'
import { exportDocument, readExport } from '@/lib/members/export'
import {
  type MemberDb,
  type MemberRecord,
  applyChanges,
  createEmailToken,
  createMember,
  deleteMember,
  findEmailToken,
  findMember,
  memberDb,
  setDigest,
} from '@/lib/members/store'
import { confirmSignup } from '@/lib/newsletter/confirm'
import { GLIA_NOTES_CONSENT_VERSION } from '@/lib/newsletter/consent'
import { eraseNewsletter, finishNewsletterErasure } from '@/lib/newsletter/erase'
import { type ListmonkClient, listmonkClient } from '@/lib/newsletter/listmonk'
import { checkMembersSubscribers, syncMember } from '@/lib/newsletter/members'
import { oneClickUrl } from '@/lib/newsletter/paths'
import { handleUnsubscribe, recordUnsubscribe } from '@/lib/newsletter/unsubscribe'
import { inTransaction } from '@/jobs/maintenance/task'
import { LISTMONK_API_USER } from '@/scripts/listmonk-settings'

import { DAY, rows, testPayload, unique } from './helpers'
import { type Listmonk, listmonkAvailable, startListmonk } from './listmonk'
import { freePort } from './mailpit'

// Members' Glia Notes in listmonk (M2, D50; PLAN §13, §18.1) against the migrated scratch database
// and a real listmonk with the server's settings (tests/integration/listmonk.ts): the sync of the
// account's choice (on with the member's consent records, off, an address change, a subscription
// the address had through the form, a subscriber another member took over), the one-time look for
// a newly proven address (a form subscription made before the account, or before the address was
// added), the daily check after a restore of listmonk lost a subscriber or set its address back,
// a restore of the main database that brought back a row from before the member withdrew, the
// form's confirmation and the unsubscribe keeping members in step, the erasure with "Delete my
// account" and a confirmed deletion request (also when it fails half-way, when listmonk cannot be
// reached or is not configured, or when the deletion after the commit fails), the deletion log's
// unlinked consent records, the export's consent records, and an inactivity deletion that leaves
// Glia Notes alone (PLAN §22.2, question 11). Every assertion is about the test's own members and
// addresses: the scratch database is shared with the other integration tests (one file at a time),
// the listmonk is this file's own. Fake addresses only.

const canStartListmonk = await listmonkAvailable()
const ORIGIN = 'https://gliagora.example'
const SECRET = process.env.PAYLOAD_SECRET ?? 'test-data-only'

let listmonk: Listmonk | undefined
let client: ListmonkClient
let payload: Payload
let store: MemberDb
/** The deletion log's last row before this file ran (the other files log the same listmonk IDs). */
let logBaseline = 0

beforeAll(async () => {
  if (canStartListmonk) listmonk = await startListmonk()
  payload = await testPayload(
    listmonk ? { LISTMONK_URL: listmonk.url, LISTMONK_API_TOKEN: listmonk.token } : {},
  )
  store = memberDb(payload)
  if (listmonk) {
    client = listmonkClient({ url: listmonk.url, user: LISTMONK_API_USER, token: listmonk.token })
  }
  const [last] = await rows<{ id: number | null }>(
    payload,
    sql`select max(id) as id from deletion_log`,
  )
  logBaseline = Number(last?.id ?? 0)
})

afterAll(async () => {
  await payload?.destroy()
  await listmonk?.stop()
})

const address = (prefix: string) => `${unique(prefix)}@example.org`

/** A fresh fake ORCID iD (9999-…, outside ORCID's ranges), with its check character. */
function fakeOrcid() {
  const digits = `9999${String(Date.now() % 1e11).padStart(11, '0')}`
  return `${digits}${orcidCheckCharacter(digits)}`.replace(
    /^(\d{4})(\d{4})(\d{4})(.{4})$/,
    '$1-$2-$3-$4',
  )
}
/**
 * An hour ago: the tests' times follow each other from there, and stay in the past, since listmonk
 * dates its subscribers by its own clock (the deletion log spares a subscriber made after a logged
 * deletion, also in the tests that run after this file).
 */
const T0 = Date.now() - 3_600_000
/** A moment `seconds` after T0. */
const at = (seconds: number) => new Date(T0 + seconds * 1000)
let clock = 0
/** The next moment, later than every earlier one. */
const tick = () => at(++clock)

/** Statements on listmonk's own database, as its owner: the rows of the last one. */
async function inListmonk<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const db = drizzle(listmonk!.databaseUrl)
  try {
    return (await db.execute(query)).rows as T[]
  } finally {
    await db.$client.end()
  }
}

/** What listmonk holds of an address: its subscriber and subscriptions. */
const heldBy = (email: string) =>
  inListmonk<{ id: number; uuid: string; list: string; status: string }>(sql`
    select s.id, s.uuid::text as uuid, l.name as list, sl.status::text as status
    from subscribers s
    left join subscriber_lists sl on sl.subscriber_id = s.id
    left join lists l on l.id = sl.list_id
    where s.email = ${email}`)

/** Whether listmonk still has a subscriber with this ID. */
const exists = async (id: number) =>
  (await inListmonk(sql`select id from subscribers where id = ${id}`)).length > 0

/** A subscriber's consent records, oldest first: event, source, version and time. */
const consentOf = async (uuid: string) =>
  (
    await rows<{ event: string; source: string; consent_version: string | null; at: string }>(
      payload,
      sql`select event, source, consent_version, at from consent_log
        where subscriber_uuid = ${uuid} order by at, id`,
    )
  ).map((row) => [row.event, row.source, row.consent_version, new Date(row.at).toISOString()])

/**
 * This file's deletion-log actions for a target, logged at `since` or later (listmonk's IDs start
 * at 1 in every test file's listmonk, so the other files log the same IDs; the rows after the
 * baseline are this file's). A deletion is logged no earlier than the moment it was decided, after
 * everything its transaction read (src/lib/newsletter/members.ts, `deletionTime`).
 */
const logged = async (collection: string, id: number, since: Date) =>
  (
    await rows<{ action: string }>(
      payload,
      sql`select action from deletion_log
        where id > ${logBaseline} and target_collection = ${collection} and target_id = ${id}
          and at >= ${since.toISOString()}`,
    )
  ).map((row) => row.action)

/** The newest consent record of a subscriber: its event, source and version, and whether its time is `since` or later. */
const newestConsent = async (uuid: string, since: Date) => {
  const record = (await consentOf(uuid)).at(-1)
  return record && [...record.slice(0, 3), record[3]! >= since.toISOString()]
}

/** How many consent records the log holds (for "no new records"). */
const consentCount = async () =>
  Number(
    (await rows<{ n: number }>(payload, sql`select count(*)::int as n from consent_log`))[0]?.n,
  )

/** A member's row as a restore of the main database would bring it back (all its columns). */
async function snapshotOf(id: number): Promise<unknown> {
  const [row] = await rows<{ r: unknown }>(
    payload,
    sql`select row_to_json(m) as r from members m where id = ${id}`,
  )
  return row!.r
}

/** Puts a member's row back as the snapshot has it (inserting it again if it was deleted). */
async function restoreRow(id: number, snapshot: unknown) {
  await store.execute(sql`delete from members where id = ${id}`)
  await store.execute(sql`
    insert into members select * from json_populate_record(null::members, ${JSON.stringify(snapshot)}::json)`)
}

/** A client of this file's listmonk whose deletions fail (a timeout after the commit, say). */
const removalFails = (): ListmonkClient => ({
  ...client,
  remove: async () => {
    throw new Error('timeout')
  },
})

const memberOf = async (id: number) => (await findMember(store, { id }))!

/** A member with an address, with Glia Notes on since `chosenAt`. */
async function memberWithGliaNotes(chosenAt: Date, email = address('member')) {
  const member = await createMember(store, { email, emailVerifiedBy: 'link' }, chosenAt)
  expect(
    await setDigest(
      store,
      member.id,
      { optIn: true, version: GLIA_NOTES_CONSENT_VERSION },
      chosenAt,
    ),
  ).toBe(true)
  return member
}

/** A member with Glia Notes on, synced: the member and its subscriber in listmonk. */
async function syncedMember(chosenAt: Date, email?: string) {
  const member = await memberWithGliaNotes(chosenAt, email)
  expect(await syncMember(store, client, member.id, tick())).toMatchObject({ outcome: 'on' })
  const synced = await memberOf(member.id)
  expect(synced.digestSubscriber).not.toBeNull()
  return { member: synced, subscriber: synced.digestSubscriber! }
}

/** A signup through the form, confirmed: its subscriber. */
async function signedUp(email: string, requestedAt: Date, now: Date) {
  const { token } = await createEmailToken(
    store,
    {
      purpose: 'newsletter',
      email,
      locale: 'en',
      requestData: {
        version: GLIA_NOTES_CONSENT_VERSION,
        source: 'newsletter-form',
        requestedAt: requestedAt.toISOString(),
      },
    },
    requestedAt,
  )
  const confirmed = await confirmSignup(payload, client, token, now)
  expect(confirmed).not.toBeNull()
  return { id: confirmed!.id, uuid: confirmed!.uuid }
}

/** Runs `work` with listmonk's address pointing at a port where nothing listens. */
async function withListmonkDown<T>(work: () => Promise<T>): Promise<T> {
  const url = process.env.LISTMONK_URL
  process.env.LISTMONK_URL = `http://127.0.0.1:${await freePort()}`
  try {
    return await work()
  } finally {
    process.env.LISTMONK_URL = url
  }
}

describe.skipIf(!canStartListmonk)("members' Glia Notes, with listmonk", () => {
  it("carries a member's on to listmonk with the member's consent records; off deletes the subscriber", async () => {
    const chosenAt = tick()
    const member = await memberWithGliaNotes(chosenAt)
    // Until the sync, listmonk has never seen the address.
    expect(await heldBy(member.email!)).toEqual([])
    const counts = await syncGliaNotes(payload, tick())
    expect(counts.subscribed).toBeGreaterThanOrEqual(1)
    expect(counts.failed).toBe(0)
    const synced = await memberOf(member.id)
    const subscriber = synced.digestSubscriber!
    expect(await heldBy(member.email!)).toEqual([
      { id: subscriber.id, uuid: subscriber.uuid, list: 'Glia Notes', status: 'confirmed' },
    ])
    // The member's consent: the request and the confirmation at the time of the choice, from the
    // account, with the version agreed to.
    const chosen = chosenAt.toISOString()
    expect(await consentOf(subscriber.uuid)).toEqual([
      ['requested', 'account', GLIA_NOTES_CONSENT_VERSION, chosen],
      ['confirmed', 'account', GLIA_NOTES_CONSENT_VERSION, chosen],
    ])
    // Synced: the next run leaves the member alone.
    expect(await syncMember(store, client, member.id, tick())).toBeNull()

    // Off: the subscriber is deleted at once, its end recorded and logged.
    const offAt = tick()
    await setDigest(store, member.id, { optIn: false }, offAt)
    const now = tick()
    expect(await syncMember(store, client, member.id, now)).toEqual({
      outcome: 'off',
      removed: [subscriber.id],
    })
    expect(await heldBy(member.email!)).toEqual([])
    expect(await newestConsent(subscriber.uuid, now)).toEqual([
      'unsubscribed',
      'account',
      null,
      true,
    ])
    expect(await logged('newsletter', subscriber.id, now)).toEqual(['delete'])
    expect(await memberOf(member.id)).toMatchObject({
      digestOptIn: false,
      digestSubscriber: null,
      digestSyncedAt: now,
    })
  })

  it('moves the subscriber to a new address, with no new consent record', async () => {
    const { member, subscriber } = await syncedMember(tick())
    const newAddress = address('moved')
    await applyChanges(store, member.id, { email: newAddress, emailVerifiedBy: 'link' }, tick())
    expect(await syncMember(store, client, member.id, tick())).toEqual({
      outcome: 'on',
      removed: [],
    })
    expect(await heldBy(member.email!)).toEqual([])
    expect(await heldBy(newAddress)).toEqual([
      { id: subscriber.id, uuid: subscriber.uuid, list: 'Glia Notes', status: 'confirmed' },
    ])
    expect((await consentOf(subscriber.uuid)).map(([event]) => event)).toEqual([
      'requested',
      'confirmed',
    ])
  })

  it('takes over the subscription the new address had through the form, and deletes the old subscriber', async () => {
    const { member, subscriber: old } = await syncedMember(tick())
    const other = address('form')
    const formAt = tick()
    const form = await signedUp(other, formAt, tick())
    await applyChanges(store, member.id, { email: other, emailVerifiedBy: 'link' }, tick())
    const now = tick()
    expect(await syncMember(store, client, member.id, now)).toEqual({
      outcome: 'on',
      removed: [old.id],
    })
    expect(await exists(old.id)).toBe(false)
    expect(await logged('newsletter', old.id, now)).toEqual(['delete'])
    expect(await newestConsent(old.uuid, now)).toEqual(['unsubscribed', 'account', null, true])
    // The form's records, later than the member's choice, stand: nothing new.
    expect((await consentOf(form.uuid)).map(([event, source]) => [event, source])).toEqual([
      ['requested', 'newsletter-form'],
      ['confirmed', 'newsletter-form'],
    ])
    expect((await memberOf(member.id)).digestSubscriber).toEqual(form)
  })

  it('never moves or deletes a subscriber another member took over with the old address', async () => {
    const { member: first, subscriber } = await syncedMember(tick())
    const oldAddress = first.email!
    await applyChanges(
      store,
      first.id,
      { email: address('first-new'), emailVerifiedBy: 'link' },
      tick(),
    )
    // Another account takes the old address and turns Glia Notes on; its sync runs first.
    const second = await memberWithGliaNotes(tick(), oldAddress)
    expect(await syncMember(store, client, second.id, tick())).toEqual({
      outcome: 'on',
      removed: [],
    })
    expect((await memberOf(second.id)).digestSubscriber).toEqual(subscriber)
    // The first member's sync leaves that subscriber alone and subscribes the new address.
    expect(await syncMember(store, client, first.id, tick())).toEqual({
      outcome: 'on',
      removed: [],
    })
    expect(await heldBy(oldAddress)).toEqual([
      { id: subscriber.id, uuid: subscriber.uuid, list: 'Glia Notes', status: 'confirmed' },
    ])
    const moved = (await memberOf(first.id)).digestSubscriber!
    expect(moved.id).not.toBe(subscriber.id)
    expect((await consentOf(moved.uuid)).map(([event, source]) => [event, source])).toEqual([
      ['requested', 'account'],
      ['confirmed', 'account'],
    ])
  })

  it('subscribes a member again after a restore of listmonk lost the subscriber, with the consent under the new one', async () => {
    const chosenAt = tick()
    const { member, subscriber: lost } = await syncedMember(chosenAt)
    const kept = await syncedMember(tick())
    // A restore of listmonk's database from before the subscription: the subscriber is gone.
    await inListmonk(sql`delete from subscribers where id = ${lost.id}`)
    const checked = await checkGliaNotesMembers(payload, tick())
    expect(checked.failed).toBe(0)
    expect(checked.pending).toBeGreaterThanOrEqual(1)
    expect((await memberOf(member.id)).digestSyncedAt).toBeNull()
    expect((await memberOf(kept.member.id)).digestSyncedAt).not.toBeNull()

    await syncGliaNotes(payload, tick())
    const again = (await memberOf(member.id)).digestSubscriber!
    expect(again.uuid).not.toBe(lost.uuid)
    expect(await heldBy(member.email!)).toEqual([
      { id: again.id, uuid: again.uuid, list: 'Glia Notes', status: 'confirmed' },
    ])
    // The member's consent, as given, is on record under the new subscriber.
    expect(await consentOf(again.uuid)).toEqual([
      ['requested', 'account', GLIA_NOTES_CONSENT_VERSION, chosenAt.toISOString()],
      ['confirmed', 'account', GLIA_NOTES_CONSENT_VERSION, chosenAt.toISOString()],
    ])
    // The old subscription is ended by the deletion log's check of listmonk (source listmonk).
    await applyDeletionLog(payload, tick())
    expect((await consentOf(lost.uuid)).at(-1)?.slice(0, 2)).toEqual(['unsubscribed', 'listmonk'])
    // Nothing more to mark the next night.
    await checkGliaNotesMembers(payload, tick())
    expect((await memberOf(member.id)).digestSyncedAt).not.toBeNull()
  })

  it('keeps members in step with the form: a confirmed signup turns Glia Notes on, an unsubscribe off', async () => {
    const email = address('in-step')
    const member = await createMember(store, { email, emailVerifiedBy: 'link' }, tick())
    const formAt = tick()
    const confirmedAt = tick()
    const subscriber = await signedUp(email, formAt, confirmedAt)
    expect(await memberOf(member.id)).toMatchObject({
      digestOptIn: true,
      digestChangedAt: confirmedAt,
      digestSyncedAt: confirmedAt,
      digestConsentVersion: GLIA_NOTES_CONSENT_VERSION,
      digestConsentSource: 'newsletter-form',
      digestRequestedAt: formAt,
      digestSubscriber: subscriber,
      digestAdoptCheckAt: null,
    })
    // Synced already: the form's records stand for the member's.
    expect(await syncMember(store, client, member.id, tick())).toBeNull()
    expect((await consentOf(subscriber.uuid)).map(([, source]) => source)).toEqual([
      'newsletter-form',
      'newsletter-form',
    ])

    const leftAt = tick()
    const response = await handleUnsubscribe(
      new Request(oneClickUrl(ORIGIN, subscriber.id, subscriber.uuid), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
      {
        listmonk: client,
        record: (found, source) => recordUnsubscribe(payload, found, source, leftAt),
      },
    )
    expect(response.status).toBe(200)
    expect(await memberOf(member.id)).toMatchObject({
      digestOptIn: false,
      digestChangedAt: leftAt,
      digestSyncedAt: leftAt,
      digestSubscriber: null,
    })
    // Never subscribed again by the sync.
    expect(await syncMember(store, client, member.id, tick())).toBeNull()
    expect(await heldBy(email)).toEqual([])
  })

  it('stops the run when listmonk cannot be reached, and the choice waits', async () => {
    const member = await memberWithGliaNotes(tick())
    const counts = await withListmonkDown(() => syncGliaNotes(payload, tick()))
    expect(counts.failed).toBe(1)
    expect((await memberOf(member.id)).digestSyncedAt).toBeNull()
    expect(await heldBy(member.email!)).toEqual([])
    // Off: nothing is asked or changed.
    const url = process.env.LISTMONK_URL
    process.env.LISTMONK_URL = ''
    try {
      expect(await syncGliaNotes(payload, tick())).toEqual({
        subscribed: 0,
        unsubscribed: 0,
        adopted: 0,
        failed: 0,
      })
      expect(await checkGliaNotesMembers(payload, tick())).toEqual({
        checked: 0,
        pending: 0,
        off: 0,
        failed: 0,
      })
    } finally {
      process.env.LISTMONK_URL = url
    }
    expect((await memberOf(member.id)).digestSyncedAt).toBeNull()
    await syncGliaNotes(payload, tick())
    expect((await memberOf(member.id)).digestSyncedAt).not.toBeNull()
  })

  it('leaves Glia Notes alone when an account is deleted for inactivity', async () => {
    const { member, subscriber } = await syncedMember(tick())
    // Warned long ago, never seen since: due for deletion.
    const now = new Date()
    await store.execute(sql`
      update members set last_seen_at = ${new Date(now.getTime() - 800 * DAY).toISOString()},
        deletion_warned_at = ${new Date(now.getTime() - 40 * DAY).toISOString()}
      where id = ${member.id}`)
    const counts = await cleanInactiveMembers(payload, now)
    expect(counts.deleted).toBeGreaterThanOrEqual(1)
    expect(await findMember(store, { id: member.id })).toBeNull()
    expect(await heldBy(member.email!)).toEqual([
      { id: subscriber.id, uuid: subscriber.uuid, list: 'Glia Notes', status: 'confirmed' },
    ])
    expect(await consentOf(subscriber.uuid)).toHaveLength(2)
    expect(await logged('newsletter', subscriber.id, now)).toEqual([])
    // Nor does the deletion log touch it, nor the check of running subscriptions.
    await applyDeletionLog(payload, new Date())
    expect(await exists(subscriber.id)).toBe(true)
    expect(await consentOf(subscriber.uuid)).toHaveLength(2)
  })

  it('erases Glia Notes with an account deleted on purpose, also at an address the sync has not carried yet', async () => {
    const { member, subscriber } = await syncedMember(tick())
    const oldAddress = member.email!
    const recordIds = (
      await rows<{ id: number }>(
        payload,
        sql`select id from consent_log where subscriber_uuid = ${subscriber.uuid} order by id`,
      )
    ).map((row) => Number(row.id))
    expect(recordIds).toHaveLength(2)
    await applyChanges(
      store,
      member.id,
      { email: address('pending'), emailVerifiedBy: 'link' },
      tick(),
    )
    const now = tick()
    expect(await deleteOwnAccount(payload, await memberOf(member.id), now)).toBe(true)
    // The subscriber with the old address is gone, logged, its records unlinked (and logged).
    expect(await heldBy(oldAddress)).toEqual([])
    expect(await logged('newsletter', subscriber.id, now)).toEqual(['delete'])
    expect(await consentOf(subscriber.uuid)).toEqual([])
    const unlinked = await rows<{ target_id: number }>(
      payload,
      sql`select target_id from deletion_log
        where id > ${logBaseline} and target_collection = 'consent-log' and action = 'unlink'
          and at >= ${now.toISOString()} and target_id in (${sql.join(
            recordIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        order by target_id`,
    )
    expect(unlinked.map((row) => Number(row.target_id))).toEqual(recordIds)
    const records = await rows<{ subscriber_uuid: string | null; subscriber_id: number | null }>(
      payload,
      sql`select subscriber_uuid, subscriber_id from consent_log
        where id in (${sql.join(
          unlinked.map((row) => sql`${row.target_id}`),
          sql`, `,
        )})`,
    )
    expect(records).toEqual([
      { subscriber_uuid: null, subscriber_id: null },
      { subscriber_uuid: null, subscriber_id: null },
    ])
    // The request's record says a subscription ended (the final email says so too).
    const [request] = await rows<{ outcome: Record<string, number> }>(
      payload,
      sql`select outcome from data_requests where source = 'account' and received_at = ${now.toISOString()}`,
    )
    expect(request?.outcome).toEqual({ accountDeleted: 1, newsletterRemoved: 1 })

    // A restore that brings the links back: the deletion log unlinks them again, but not a newer
    // record that got a logged ID (a restore sets the IDs back).
    await store.execute(sql`
      update consent_log set subscriber_uuid = ${subscriber.uuid}, subscriber_id = ${subscriber.id}
      where id = ${unlinked[0]!.target_id}`)
    const later = new Date(now.getTime() + DAY)
    await store.execute(sql`
      update consent_log set created_at = ${later.toISOString()},
        subscriber_uuid = ${subscriber.uuid}, subscriber_id = ${subscriber.id}
      where id = ${unlinked[1]!.target_id}`)
    const counts = await applyDeletionLog(payload, tick())
    expect(counts.consentUnlinked).toBeGreaterThanOrEqual(1)
    const linked = await rows<{ id: number; linked: boolean }>(
      payload,
      sql`select id, subscriber_uuid is not null as linked from consent_log
        where id in (${unlinked[0]!.target_id}, ${unlinked[1]!.target_id}) order by id`,
    )
    expect(linked).toEqual(
      [
        { id: Number(unlinked[0]!.target_id), linked: false },
        { id: Number(unlinked[1]!.target_id), linked: true },
      ].sort((a, b) => a.id - b.id),
    )
  })

  it('fails the account deletion, changing nothing, when listmonk cannot be reached', async () => {
    const { member, subscriber } = await syncedMember(tick())
    await expect(
      withListmonkDown(() => deleteOwnAccount(payload, member, tick())),
    ).rejects.toThrow()
    expect(await findMember(store, { id: member.id })).not.toBeNull()
    expect(await exists(subscriber.id)).toBe(true)
    expect(await consentOf(subscriber.uuid)).toHaveLength(2)
  })

  it('erases the subscription of an address with a confirmed deletion request; a failure half-way keeps it, and the link', async () => {
    const email = address('request')
    const subscriber = await signedUp(email, tick(), tick())
    const { requestId, token } = await recordDataRequest(
      payload,
      { email, kind: 'deletion', name: null, details: null, locale: 'en' },
      SECRET,
      tick(),
    )
    // The record cannot be closed: the failure comes after the erasure, in the same transaction.
    const name = sql.raw(`fail_request_${requestId}`)
    await store.execute(sql`
      CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = ${sql.raw(String(requestId))} THEN RAISE EXCEPTION 'test failure'; END IF;
        RETURN NEW;
      END $$`)
    await store.execute(sql`
      CREATE TRIGGER ${name} BEFORE UPDATE ON data_requests
        FOR EACH ROW EXECUTE FUNCTION ${name}()`)
    const failedAt = tick()
    try {
      await expect(confirmDataRequest(payload, token, failedAt)).rejects.toThrow()
    } finally {
      await store.execute(sql`DROP TRIGGER IF EXISTS ${name} ON data_requests`)
      await store.execute(sql`DROP FUNCTION IF EXISTS ${name}()`)
    }
    // Nothing was deleted in listmonk inside the transaction, so nothing is lost.
    expect(await exists(subscriber.id)).toBe(true)
    expect(await consentOf(subscriber.uuid)).toHaveLength(2)
    expect(await logged('newsletter', subscriber.id, failedAt)).toEqual([])
    expect(await findEmailToken(store, token, new Date())).not.toBeNull()

    const confirmedAt = tick()
    const confirmed = await confirmDataRequest(payload, token, confirmedAt)
    expect(confirmed).toMatchObject({ kind: 'deleted', outcome: { newsletterRemoved: 1 } })
    expect(await heldBy(email)).toEqual([])
    expect(await consentOf(subscriber.uuid)).toEqual([])
    expect(await logged('newsletter', subscriber.id, confirmedAt)).toEqual(['delete'])
  })

  it("deletes the subscriber again when the deletion right after a member's off failed", async () => {
    const { member, subscriber } = await syncedMember(tick())
    const failing = removalFails()
    // The member turns Glia Notes off; listmonk's deletion fails after the commit. The run's clock
    // is older than the subscriber (listmonk dated it by its own): the deletion is logged after it
    // all the same.
    await setDigest(store, member.id, { optIn: false }, tick())
    const now = tick()
    expect(await syncMember(store, failing, member.id, now)).toMatchObject({
      outcome: 'off',
      removed: [subscriber.id],
    })
    expect(await exists(subscriber.id)).toBe(true)
    const counts = await applyDeletionLog(payload, new Date(Date.now() + 60_000))
    expect(counts.subscribers).toBeGreaterThanOrEqual(1)
    expect(await exists(subscriber.id)).toBe(false)
  })

  it('deletes the subscriber again when the deletion right after an erasure failed', async () => {
    const { member, subscriber } = await syncedMember(tick())
    // The request's clock is older than the subscriber (listmonk dated it by its own clock, as if a
    // sync had made it while the deletion waited for the member's row).
    const now = tick()
    expect(await deleteOwnAccount(payload, await memberOf(member.id), now, removalFails())).toBe(
      true,
    )
    expect(await findMember(store, { id: member.id })).toBeNull()
    expect(await exists(subscriber.id)).toBe(true)
    expect(await consentOf(subscriber.uuid)).toEqual([])
    expect(await logged('newsletter', subscriber.id, now)).toEqual(['delete'])
    // The deletion log deletes it, and writes no record that names it again.
    const counts = await applyDeletionLog(payload, new Date(Date.now() + 60_000))
    expect(counts.subscribers).toBeGreaterThanOrEqual(1)
    expect(await exists(subscriber.id)).toBe(false)
    expect(await consentOf(subscriber.uuid)).toEqual([])
    // The same with the functions alone: the deletion after the commit never throws.
    const other = await syncedMember(tick())
    // As the callers do: the erasure, then the member, in one transaction.
    const erased = await inTransaction(payload, async (_req, db) => {
      const result = await eraseNewsletter(
        db,
        {
          email: other.member.email,
          member: { id: other.member.id, subscriber: other.subscriber },
        },
        tick(),
        client,
      )
      expect(await deleteMember(db, other.member.id, { reason: 'request' }, tick())).toBe(true)
      return result
    })
    expect(erased).toEqual({ removed: 1, subscriberIds: [other.subscriber.id] })
    await expect(
      finishNewsletterErasure(erased.subscriberIds, removalFails()),
    ).resolves.toBeUndefined()
    expect(await exists(other.subscriber.id)).toBe(true)
    await applyDeletionLog(payload, new Date(Date.now() + 60_000))
    expect(await exists(other.subscriber.id)).toBe(false)
  })

  it('refuses an erasure while listmonk is not configured and there may be something to erase', async () => {
    const { member, subscriber } = await syncedMember(tick())
    const email = address('unconfigured')
    const form = await signedUp(email, tick(), tick())
    const { token } = await recordDataRequest(
      payload,
      { email, kind: 'deletion', name: null, details: null, locale: 'en' },
      SECRET,
      tick(),
    )
    const url = process.env.LISTMONK_URL
    process.env.LISTMONK_URL = ''
    try {
      // A member whose row names a subscriber, and an address while the newsletter has records.
      await expect(deleteOwnAccount(payload, await memberOf(member.id), tick())).rejects.toThrow()
      await expect(confirmDataRequest(payload, token, tick())).rejects.toThrow()
    } finally {
      process.env.LISTMONK_URL = url
    }
    expect(await findMember(store, { id: member.id })).not.toBeNull()
    expect(await exists(subscriber.id)).toBe(true)
    expect(await findEmailToken(store, token, new Date())).not.toBeNull()
    // Configured again: both go through.
    expect(await deleteOwnAccount(payload, await memberOf(member.id), tick())).toBe(true)
    expect(await exists(subscriber.id)).toBe(false)
    expect(await confirmDataRequest(payload, token, tick())).toMatchObject({
      kind: 'deleted',
      outcome: { newsletterRemoved: 1 },
    })
    expect(await exists(form.id)).toBe(false)
  })

  for (const withdrawal of ['off', 'unsubscribe-link'] as const) {
    it(`switches a member off, rather than subscribing again, after a restore of a row from before the member withdrew (${withdrawal})`, async () => {
      const { member, subscriber } = await syncedMember(tick())
      // The night's backup of the main database holds the member on, synced to the subscriber.
      const snapshot = await snapshotOf(member.id)
      if (withdrawal === 'off') {
        await setDigest(store, member.id, { optIn: false }, tick())
        expect(await syncMember(store, client, member.id, tick())).toMatchObject({ outcome: 'off' })
      } else {
        const leftAt = tick()
        const response = await handleUnsubscribe(
          new Request(oneClickUrl(ORIGIN, subscriber.id, subscriber.uuid), {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'List-Unsubscribe=One-Click',
          }),
          {
            listmonk: client,
            record: (found, source) => recordUnsubscribe(payload, found, source, leftAt),
          },
        )
        expect(response.status).toBe(200)
      }
      expect(await exists(subscriber.id)).toBe(false)
      // The main database is restored from that night; the consent log and the deletion log are
      // carried over (deploy/backup/restore.sh).
      await restoreRow(member.id, snapshot)
      expect(await memberOf(member.id)).toMatchObject({
        digestOptIn: true,
        digestSubscriber: subscriber,
      })
      await applyDeletionLog(payload, tick())
      const checked = await checkGliaNotesMembers(payload, tick())
      expect(checked).toMatchObject({ failed: 0 })
      expect(checked.off).toBeGreaterThanOrEqual(1)
      expect(await memberOf(member.id)).toMatchObject({
        digestOptIn: false,
        digestSubscriber: null,
        digestConsentSource: null,
      })
      // Nothing waits for the sync: no subscriber, and no new consent record.
      const records = await consentCount()
      expect(await syncMember(store, client, member.id, tick())).toBeNull()
      expect(await heldBy(member.email!)).toEqual([])
      expect(await consentCount()).toBe(records)

      // The same when the restored row was still waiting for the sync: the sync switches it off.
      await restoreRow(member.id, snapshot)
      await store.execute(sql`update members set digest_synced_at = null where id = ${member.id}`)
      expect(await syncMember(store, client, member.id, tick())).toEqual({
        outcome: 'withdrawn',
        removed: [],
      })
      expect(await heldBy(member.email!)).toEqual([])
      expect(await memberOf(member.id)).toMatchObject({
        digestOptIn: false,
        digestSubscriber: null,
      })
      expect(await consentCount()).toBe(records)
    })
  }

  it('leaves a member the deletion log names to the deletion log, after a restore brought the account back', async () => {
    const { member, subscriber } = await syncedMember(tick())
    const snapshot = await snapshotOf(member.id)
    expect(await deleteOwnAccount(payload, await memberOf(member.id), tick())).toBe(true)
    expect(await exists(subscriber.id)).toBe(false)
    // Restored: the account is back, on and synced to a subscriber whose records were unlinked.
    await restoreRow(member.id, snapshot)
    await checkGliaNotesMembers(payload, tick())
    await syncGliaNotes(payload, tick())
    expect(await heldBy(member.email!)).toEqual([])
    expect((await memberOf(member.id)).digestSyncedAt).not.toBeNull()
    await applyDeletionLog(payload, tick())
    expect(await findMember(store, { id: member.id })).toBeNull()
    expect(await heldBy(member.email!)).toEqual([])
  })

  it('moves the subscriber back when a restore of listmonk set it to the old address', async () => {
    const { member, subscriber } = await syncedMember(tick())
    const oldAddress = member.email!
    const newAddress = address('drifted')
    await applyChanges(store, member.id, { email: newAddress, emailVerifiedBy: 'link' }, tick())
    expect(await syncMember(store, client, member.id, tick())).toMatchObject({ outcome: 'on' })
    const records = await consentCount()
    // A restore of listmonk alone, from before the move.
    await client.changeEmail(subscriber.id, oldAddress)
    const checked = await checkGliaNotesMembers(payload, tick())
    expect(checked.pending).toBeGreaterThanOrEqual(1)
    expect((await memberOf(member.id)).digestSyncedAt).toBeNull()
    expect(await syncMember(store, client, member.id, tick())).toEqual({
      outcome: 'on',
      removed: [],
    })
    expect(await heldBy(oldAddress)).toEqual([])
    expect(await heldBy(newAddress)).toEqual([
      { id: subscriber.id, uuid: subscriber.uuid, list: 'Glia Notes', status: 'confirmed' },
    ])
    expect(await consentCount()).toBe(records)
  })

  it('takes over a subscription made on the newsletter page before the account existed', async () => {
    const email = address('form-first')
    const formAt = tick()
    const confirmedAt = tick()
    const form = await signedUp(email, formAt, confirmedAt)
    const records = await consentCount()
    const member = await createMember(store, { email, emailVerifiedBy: 'link' }, tick())
    expect(member).toMatchObject({ digestOptIn: false, digestAdoptCheckAt: expect.any(Date) })
    expect(await syncMember(store, client, member.id, tick())).toEqual({
      outcome: 'adopted',
      removed: [],
    })
    expect(await memberOf(member.id)).toMatchObject({
      digestOptIn: true,
      digestChangedAt: confirmedAt,
      digestConsentVersion: GLIA_NOTES_CONSENT_VERSION,
      digestConsentSource: 'newsletter-form',
      digestRequestedAt: formAt,
      digestSubscriber: form,
      digestAdoptCheckAt: null,
    })
    expect(await consentCount()).toBe(records)
    // The account page and the export show it, with the newsletter page's records.
    const document = exportDocument(
      await readExport(store, await memberOf(member.id), new Date()),
      new Date(),
    )
    expect(document.gliaNotes).toMatchObject({
      on: true,
      consentGivenOn: 'newsletter-form',
      consentRecords: [
        { event: 'requested', source: 'newsletter-form', at: formAt.toISOString() },
        { event: 'confirmed', source: 'newsletter-form', at: confirmedAt.toISOString() },
      ],
    })
    expect(JSON.stringify(document)).not.toContain(form.uuid)
    // Synced: nothing more to do. Deleting the account ends it.
    expect(await syncMember(store, client, member.id, tick())).toBeNull()
    expect(await deleteOwnAccount(payload, await memberOf(member.id), tick())).toBe(true)
    expect(await heldBy(email)).toEqual([])
  })

  it('takes over the subscription of an address added later, and looks only once', async () => {
    const email = address('added-later')
    const form = await signedUp(email, tick(), tick())
    const member = await createMember(store, { orcidId: fakeOrcid() }, tick())
    expect(member.digestAdoptCheckAt).toBeNull()
    await applyChanges(store, member.id, { email, emailVerifiedBy: 'link' }, tick())
    expect(await syncMember(store, client, member.id, tick())).toMatchObject({ outcome: 'adopted' })
    expect((await memberOf(member.id)).digestSubscriber).toEqual(form)
    // An address without a subscription: the look clears the mark and changes nothing.
    const other = await createMember(
      store,
      { email: address('no-form'), emailVerifiedBy: 'link' },
      tick(),
    )
    expect(await syncMember(store, client, other.id, tick())).toEqual({
      outcome: 'checked',
      removed: [],
    })
    expect(await memberOf(other.id)).toMatchObject({ digestOptIn: false, digestAdoptCheckAt: null })
    expect(await syncMember(store, client, other.id, tick())).toBeNull()
  })

  it("records the newsletter page's consent under a new subscriber for a member who joined there", async () => {
    const email = address('joined-by-form')
    const member = await createMember(store, { email, emailVerifiedBy: 'link' }, tick())
    const formAt = tick()
    const confirmedAt = tick()
    const lost = await signedUp(email, formAt, confirmedAt)
    expect((await memberOf(member.id)).digestSubscriber).toEqual(lost)
    // listmonk loses the subscriber (a restore from before it): the check and the sync subscribe
    // the address anew, with where and when the person agreed.
    await inListmonk(sql`delete from subscribers where id = ${lost.id}`)
    await checkGliaNotesMembers(payload, tick())
    expect(await syncMember(store, client, member.id, tick())).toMatchObject({ outcome: 'on' })
    const again = (await memberOf(member.id)).digestSubscriber!
    expect(again.uuid).not.toBe(lost.uuid)
    expect(await consentOf(again.uuid)).toEqual([
      ['requested', 'newsletter-form', GLIA_NOTES_CONSENT_VERSION, formAt.toISOString()],
      ['confirmed', 'newsletter-form', GLIA_NOTES_CONSENT_VERSION, confirmedAt.toISOString()],
    ])
  })

  it('never moves a new signup of the old address to the new one, and moves the old subscriber past an account that is off', async () => {
    // (a) The owner of the old address signs up on the newsletter page before the member's sync.
    const { member, subscriber } = await syncedMember(tick())
    const oldAddress = member.email!
    const newAddress = address('moved-away')
    await applyChanges(store, member.id, { email: newAddress, emailVerifiedBy: 'link' }, tick())
    const signup = await signedUp(oldAddress, tick(), tick())
    expect(signup).toEqual(subscriber)
    expect((await memberOf(member.id)).digestSubscriber).toBeNull()
    expect(await syncMember(store, client, member.id, tick())).toEqual({
      outcome: 'on',
      removed: [],
    })
    expect(await heldBy(oldAddress)).toEqual([
      { id: subscriber.id, uuid: subscriber.uuid, list: 'Glia Notes', status: 'confirmed' },
    ])
    const moved = (await memberOf(member.id)).digestSubscriber!
    expect(moved.id).not.toBe(subscriber.id)
    expect(await heldBy(newAddress)).toHaveLength(1)

    // (b) Another account takes the old address with Glia Notes off before the member's sync: it
    // does not take the member's subscription over, and the sync moves it to the new address.
    const first = await syncedMember(tick())
    const firstOld = first.member.email!
    await applyChanges(
      store,
      first.member.id,
      { email: address('first-moved'), emailVerifiedBy: 'link' },
      tick(),
    )
    const second = await createMember(store, { email: firstOld, emailVerifiedBy: 'link' }, tick())
    expect(await syncMember(store, client, second.id, tick())).toEqual({
      outcome: 'checked',
      removed: [],
    })
    expect((await memberOf(second.id)).digestOptIn).toBe(false)
    expect(await syncMember(store, client, first.member.id, tick())).toEqual({
      outcome: 'on',
      removed: [],
    })
    expect(await heldBy(firstOld)).toEqual([])
    expect((await memberOf(first.member.id)).digestSubscriber).toEqual(first.subscriber)
  })

  it("exports the consent records of the member's subscription, never its UUID or ID", async () => {
    const { member, subscriber } = await syncedMember(tick())
    const now = new Date()
    const document = exportDocument(await readExport(store, member, now), now)
    expect(document.gliaNotes.consentRecords).toEqual([
      {
        event: 'requested',
        consentVersion: GLIA_NOTES_CONSENT_VERSION,
        source: 'account',
        at: member.digestChangedAt!.toISOString(),
      },
      {
        event: 'confirmed',
        consentVersion: GLIA_NOTES_CONSENT_VERSION,
        source: 'account',
        at: member.digestChangedAt!.toISOString(),
      },
    ])
    const text = JSON.stringify(document)
    expect(text).not.toContain(subscriber.uuid)
    expect(text).not.toContain('subscriberId')
    // Switched off: the ended subscription is no longer the account's.
    await setDigest(store, member.id, { optIn: false }, tick())
    await syncMember(store, client, member.id, tick())
    const off = exportDocument(await readExport(store, await memberOf(member.id), now), now)
    expect(off.gliaNotes).toMatchObject({ on: false, consentRecords: [] })
  })

  it('marks nobody when the list cannot be read, or is empty while members hold subscribers', async () => {
    const { member } = await syncedMember(tick())
    const before = (await memberOf(member.id)).digestSyncedAt
    expect(await withListmonkDown(() => checkGliaNotesMembers(payload, tick()))).toEqual({
      checked: 0,
      pending: 0,
      off: 0,
      failed: 1,
    })
    const warnings: string[] = []
    const empty: ListmonkClient = {
      ...client,
      listPage: async () => ({ subscribers: [], total: 0 }),
      findById: async () => {
        throw new Error('not asked')
      },
    }
    expect(
      await checkMembersSubscribers(store, empty, tick(), (line) => warnings.push(line)),
    ).toEqual({ checked: 0, pending: 0, off: 0, failed: 0 })
    expect(warnings.join('\n')).toContain('none was marked')
    expect((await memberOf(member.id)).digestSyncedAt).toEqual(before)
  })
})

describe('members whose choice predates listmonk', () => {
  it('wait while listmonk is off, as stored', async () => {
    const url = process.env.LISTMONK_URL
    process.env.LISTMONK_URL = ''
    try {
      const member = await createMember(
        store,
        { email: address('waiting'), emailVerifiedBy: 'link' },
        tick(),
      )
      await setDigest(
        store,
        member.id,
        { optIn: true, version: GLIA_NOTES_CONSENT_VERSION },
        tick(),
      )
      const counts = await syncGliaNotes(payload, tick())
      expect(counts).toEqual({ subscribed: 0, unsubscribed: 0, adopted: 0, failed: 0 })
      const stored: MemberRecord = await memberOf(member.id)
      expect(stored).toMatchObject({
        digestOptIn: true,
        digestSyncedAt: null,
        digestSubscriber: null,
      })
    } finally {
      process.env.LISTMONK_URL = url
    }
  })
})
