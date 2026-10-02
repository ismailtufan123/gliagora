import { sql } from '@payloadcms/db-postgres'
import { drizzle } from '@payloadcms/db-postgres/drizzle/node-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyDeletionLog } from '@/jobs/maintenance/applyDeletionLog'
import { purgeMemberAuth } from '@/jobs/maintenance/purgeMemberAuth'
import { purgeRetention } from '@/jobs/maintenance/purgeRetention'
import { type MemberDb, createEmailToken, findEmailToken, memberDb } from '@/lib/members/store'
import { confirmSignup, handleConfirmation, sendWelcome } from '@/lib/newsletter/confirm'
import { GLIA_NOTES_CONSENT_VERSION } from '@/lib/newsletter/consent'
import { newInbox } from '@/lib/newsletter/cookie'
import {
  type ListmonkClient,
  ListmonkError,
  type Subscriber,
  listmonkClient,
} from '@/lib/newsletter/listmonk'
import { oneClickUrl } from '@/lib/newsletter/paths'
import { recordAndSendSignup } from '@/lib/newsletter/signup'
import { NewsletterStoreError, recordConsent } from '@/lib/newsletter/store'
import {
  type UnsubscribeSource,
  handleUnsubscribe,
  recordUnsubscribe,
} from '@/lib/newsletter/unsubscribe'
import { LISTMONK_API_USER } from '@/scripts/listmonk-settings'

import { DAY, rows, testPayload, unique } from './helpers'
import { type Listmonk, listmonkAvailable, startListmonk } from './listmonk'
import { type Mailpit, freePort, mailpitAvailable, startMailpit } from './mailpit'

// Glia Notes (M2, D50; PLAN §5.1, §13, §18.1) against the migrated scratch database, a real
// listmonk with the server's settings (tests/integration/listmonk.ts: the pinned image, or the
// program in LISTMONK_BIN; its API user has no `subscribers:sql_query`, so the app's calls work
// without SQL expressions) and a throwaway Mailpit: the signup's link and its email, the
// confirmation that makes the address listmonk's first (and only confirmed) subscriber with its
// consent records, a second signup of the same address and one from "Send it again", failures of
// listmonk and of the database that leave no subscriber without its records, the welcome email
// through the confirmation route, the unsubscribe that deletes the address at once with its records
// and ends its pending links, the deletion log after a restore of listmonk's database or a failed
// deletion, the end of subscriptions listmonk no longer has, and the purges. Every assertion is
// about the test's own records: the scratch database is shared with the other integration tests,
// the listmonk is this file's own. Fake addresses only.

const canStartMailpit = await mailpitAvailable()
const canStartListmonk = await listmonkAvailable()
const ORIGIN = 'https://gliagora.example'
const ENV = { SERVER_URL: ORIGIN, PAYLOAD_JOBS_AUTORUN: 'false' }

let mailpit: Mailpit | undefined
let listmonk: Listmonk | undefined
let client: ListmonkClient
let payload: Payload
let store: MemberDb

/** Every address the app asked listmonk for, through its client or its tasks. */
const asked: string[] = []
const realFetch = globalThis.fetch

beforeAll(async () => {
  if (canStartMailpit) mailpit = await startMailpit({ chaos: true })
  if (canStartListmonk) listmonk = await startListmonk()
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    if (listmonk && url.startsWith(listmonk.url)) asked.push(url)
    return realFetch(input, init)
  }) as typeof fetch
  payload = await testPayload({
    ...(mailpit
      ? {
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: String(mailpit.smtpPort),
          SMTP_SECURE: 'false',
          EMAIL_FROM: 'Gliagora <hello@gliagora.com>',
        }
      : {}),
    ...(listmonk ? { LISTMONK_URL: listmonk.url, LISTMONK_API_TOKEN: listmonk.token } : {}),
  })
  store = memberDb(payload)
  if (listmonk) {
    client = listmonkClient({ url: listmonk.url, user: LISTMONK_API_USER, token: listmonk.token })
  }
})

afterAll(async () => {
  globalThis.fetch = realFetch
  await payload?.destroy()
  await mailpit?.stop()
  await listmonk?.stop()
})

const address = (prefix: string) => `${unique(prefix)}@example.org`
const later = (ms: number) => new Date(Date.now() + ms)

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

type ConsentRow = {
  subscriber_uuid: string | null
  subscriber_id: number | null
  event: string
  consent_version: string | null
  source: string
  at: string
}

/** A subscriber's consent records, oldest first, with their times as ISO strings. */
const consentOf = async (uuid: string) =>
  (
    await rows<ConsentRow>(
      payload,
      sql`select subscriber_uuid, subscriber_id, event, consent_version, source, at
        from consent_log where subscriber_uuid = ${uuid} order by id`,
    )
  ).map((row) => ({
    ...row,
    subscriber_id: row.subscriber_id === null ? null : Number(row.subscriber_id),
    at: new Date(row.at).toISOString(),
  }))

/** The tokens of the confirmation links emailed to `email` that still work. */
async function pendingTokens(email: string) {
  const link = new RegExp(
    `${ORIGIN.replace(/[.]/g, '\\.')}/en/newsletter/confirm/\\?token=([A-Za-z0-9_-]{43})`,
  )
  const tokens: string[] = []
  for (const mail of await mailpit!.to(email)) {
    if (mail.Subject !== 'Confirm your subscription to Glia Notes') continue
    const token = link.exec(mail.Text)?.[1]
    expect(token, 'a confirmation link').toBeTruthy()
    if (await findEmailToken(store, token, new Date())) tokens.push(token!)
  }
  return tokens
}

/** The token of the one confirmation link emailed to `email` that still works. */
async function emailedToken(email: string) {
  const tokens = await pendingTokens(email)
  expect(tokens).toHaveLength(1)
  return tokens[0]!
}

/** The form's path: the link stored and emailed, for a form sent at `now`. */
const signUp = (email: string, now = new Date()) =>
  recordAndSendSignup(payload, newInbox({ email, locale: 'en' }, now), { origin: ORIGIN, now })

/** A signup through the form's path, confirmed: the subscriber's UUID and ID. */
async function subscribed(email: string, now = new Date()) {
  expect(await signUp(email, now)).toBe(undefined)
  const confirmed = await confirmSignup(payload, client, await emailedToken(email), now)
  expect(confirmed).not.toBeNull()
  expect((await client.findById(confirmed!.id))?.uuid).toBe(confirmed!.uuid)
  return { uuid: confirmed!.uuid, id: confirmed!.id }
}

/** A mail program's one-click POST for a subscriber. */
const oneClick = (id: number, uuid: string) =>
  new Request(oneClickUrl(ORIGIN, id, uuid), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  })

/** The unsubscribe route's dependencies, recording at `now`, with another client if given. */
const unsubscribing = (now: Date, other: ListmonkClient = client) => ({
  listmonk: other,
  record: (subscriber: Subscriber, source: UnsubscribeSource) =>
    recordUnsubscribe(payload, subscriber, source, now),
})

/** The real client, except that deleting fails (listmonk timed out, or was restarted). */
const failingRemove = (): ListmonkClient => ({
  ...client,
  remove: async () => {
    throw new ListmonkError('timeout')
  },
})

/** Makes the database refuse every new consent record while `work` runs. */
async function refusingConsent<T>(work: () => Promise<T>): Promise<T> {
  await rows(
    payload,
    sql.raw(`
      CREATE OR REPLACE FUNCTION test_refuse_consent() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'refused by the test'; END $$;
      CREATE TRIGGER test_refuse_consent BEFORE INSERT ON consent_log
        FOR EACH ROW EXECUTE FUNCTION test_refuse_consent();`),
  )
  try {
    return await work()
  } finally {
    await rows(
      payload,
      sql.raw(`
        DROP TRIGGER IF EXISTS test_refuse_consent ON consent_log;
        DROP FUNCTION IF EXISTS test_refuse_consent();`),
    )
  }
}

describe.skipIf(!canStartMailpit || !canStartListmonk)(
  'the signup, with listmonk and Mailpit',
  () => {
    it('emails a link, and listmonk gets the address only once it is confirmed', async () => {
      const email = address('flow')
      const sentAt = new Date(Date.now() - 60_000)
      expect(await signUp(email, sentAt)).toBeUndefined()
      const token = await emailedToken(email)
      // Until it is confirmed the signup is its link only: listmonk has never seen the address.
      expect(await heldBy(email)).toEqual([])
      expect(await client.findByEmail(email)).toBeNull()
      expect(await findEmailToken(store, token, new Date())).toMatchObject({
        purpose: 'newsletter',
        email,
        requestData: {
          version: GLIA_NOTES_CONSENT_VERSION,
          source: 'newsletter-form',
          requestedAt: sentAt.toISOString(),
        },
      })

      const now = new Date()
      const confirmed = await confirmSignup(payload, client, token, now)
      expect(confirmed).toEqual({
        email,
        locale: 'en',
        id: expect.any(Number),
        uuid: expect.any(String),
      })
      const held = await heldBy(email)
      expect(held).toEqual([
        { id: confirmed!.id, uuid: confirmed!.uuid, list: 'Glia Notes', status: 'confirmed' },
      ])
      // The consent record: the request at the time the form was sent, the confirmation now.
      const records = await consentOf(confirmed!.uuid)
      expect(records).toEqual([
        {
          subscriber_uuid: confirmed!.uuid,
          subscriber_id: confirmed!.id,
          event: 'requested',
          consent_version: GLIA_NOTES_CONSENT_VERSION,
          source: 'newsletter-form',
          at: sentAt.toISOString(),
        },
        {
          subscriber_uuid: confirmed!.uuid,
          subscriber_id: confirmed!.id,
          event: 'confirmed',
          consent_version: GLIA_NOTES_CONSENT_VERSION,
          source: 'newsletter-form',
          at: now.toISOString(),
        },
      ])
      expect(JSON.stringify(records)).not.toContain(email)
      // The link worked once.
      expect(await confirmSignup(payload, client, token, now)).toBeNull()
      expect(await consentOf(confirmed!.uuid)).toHaveLength(2)
    })

    it('keeps one subscriber for an address that signs up again, with new records', async () => {
      const email = address('again')
      const first = await subscribed(email)
      // The form, then "Send it again" 5 minutes later: one consent (the form's), two links.
      const formAt = new Date(Date.now() - 10 * 60_000)
      const inbox = newInbox({ email, locale: 'en' }, formAt)
      expect(await recordAndSendSignup(payload, inbox, { origin: ORIGIN, now: formAt })).toBe(
        undefined,
      )
      const resentAt = new Date(formAt.getTime() + 5 * 60_000)
      // "Send it again" passes the cookie's state, which keeps the form's consent.
      expect(await recordAndSendSignup(payload, inbox, { origin: ORIGIN, now: resentAt })).toBe(
        undefined,
      )
      const [one, other] = await pendingTokens(email)
      expect(other).toBeDefined()
      // Confirming the resent link (using one ends the other): an address listmonk has already.
      const now = new Date()
      const confirmed = await confirmSignup(payload, client, other!, now)
      expect(confirmed).toMatchObject({ uuid: first.uuid, id: first.id })
      expect(await findEmailToken(store, one!, new Date())).toBeNull()
      expect(await heldBy(email)).toEqual([
        { id: first.id, uuid: first.uuid, list: 'Glia Notes', status: 'confirmed' },
      ])
      const records = await consentOf(first.uuid)
      expect(records.map((row) => row.event)).toEqual([
        'requested',
        'confirmed',
        'requested',
        'confirmed',
      ])
      // The request is the form's, with the version the form showed, not the resend's.
      expect(records[2]).toMatchObject({
        at: formAt.toISOString(),
        consent_version: inbox.requested.version,
      })
      expect(records[3]).toMatchObject({ at: now.toISOString() })
    })

    it('changes nothing when listmonk cannot be reached, and the link still works', async () => {
      const email = address('down')
      await signUp(email)
      const token = await emailedToken(email)
      const down = listmonkClient({
        url: `http://127.0.0.1:${await freePort()}`,
        user: LISTMONK_API_USER,
        token: listmonk!.token,
      })
      const error = await confirmSignup(payload, down, token, new Date()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ListmonkError)
      expect(error).toMatchObject({ kind: 'unreachable' })
      expect(await findEmailToken(store, token, new Date())).not.toBeNull()
      expect(await heldBy(email)).toEqual([])
      // Once listmonk answers, the same link confirms.
      expect(await confirmSignup(payload, client, token, new Date())).toMatchObject({ email })
    })

    it('asks listmonk again when its answer was lost after it acted, and keeps one subscriber', async () => {
      const email = address('lost')
      await signUp(email)
      const token = await emailedToken(email)
      let lost = false
      const lossy: ListmonkClient = {
        ...client,
        // listmonk makes the subscriber, but its answer never arrives (a timeout).
        subscribe: async (address) => {
          if (lost) return client.subscribe(address)
          lost = true
          await client.subscribe(address)
          throw new ListmonkError('timeout')
        },
      }
      const confirmed = await confirmSignup(payload, lossy, token, new Date())
      expect(confirmed).toMatchObject({ email })
      const held = await heldBy(email)
      expect(held).toEqual([
        { id: confirmed!.id, uuid: confirmed!.uuid, list: 'Glia Notes', status: 'confirmed' },
      ])
      expect((await consentOf(confirmed!.uuid)).map((row) => row.event)).toEqual([
        'requested',
        'confirmed',
      ])
    })

    it('deletes a subscriber it made again when the records cannot be written, and the link still works', async () => {
      const email = address('undone')
      await signUp(email)
      const token = await emailedToken(email)
      const error = await refusingConsent(() =>
        confirmSignup(payload, client, token, new Date()).catch((e: unknown) => e),
      )
      expect(error).toBeInstanceOf(NewsletterStoreError)
      // listmonk holds no subscriber without its consent records.
      expect(await heldBy(email)).toEqual([])
      expect(await findEmailToken(store, token, new Date())).not.toBeNull()
      expect(await confirmSignup(payload, client, token, new Date())).toMatchObject({ email })
      expect(await heldBy(email)).toHaveLength(1)
    })

    it('leaves a subscriber listmonk had before when the records cannot be written', async () => {
      const email = address('kept')
      const first = await subscribed(email)
      await signUp(email)
      const token = await emailedToken(email)
      const error = await refusingConsent(() =>
        confirmSignup(payload, client, token, new Date()).catch((e: unknown) => e),
      )
      expect(error).toBeInstanceOf(NewsletterStoreError)
      expect(await heldBy(email)).toEqual([
        { id: first.id, uuid: first.uuid, list: 'Glia Notes', status: 'confirmed' },
      ])
      expect(await findEmailToken(store, token, new Date())).not.toBeNull()
      expect(await consentOf(first.uuid)).toHaveLength(2)
    })

    it('deletes the link again when the mail server does not take the email', async () => {
      const email = address('refused')
      await mailpit!.refuseAll(550)
      try {
        expect(await signUp(email)).toBe('unavailable')
      } finally {
        await mailpit!.refuseAll(null)
      }
      expect(await rows(payload, sql`select id from email_tokens where email = ${email}`)).toEqual(
        [],
      )
    })

    /** The confirmation route's own handling, with the route's welcome email. */
    const confirmRoute = (token: string) =>
      handleConfirmation(
        new Request(`${ORIGIN}/en/newsletter/confirm/use/`, {
          method: 'POST',
          headers: {
            origin: ORIGIN,
            host: new URL(ORIGIN).host,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token }),
        }),
        {
          env: ENV,
          confirm: (link) => confirmSignup(payload, client, link, new Date()),
          welcome: sendWelcome(payload, ORIGIN),
        },
      )

    it('sends the welcome email with the one-click unsubscribe headers (RFC 8058)', async () => {
      const email = address('welcome')
      await signUp(email)
      const response = await confirmRoute(await emailedToken(email))
      expect(response.headers.get('location')).toBe('/en/newsletter/confirmed/')
      const [held] = await heldBy(email)
      const { id, uuid } = held!
      const welcome = (await mailpit!.to(email)).find(
        (mail) => mail.Subject === 'You are subscribed to Glia Notes',
      )!
      expect(welcome.HTML).toBe('')
      expect(welcome.Text).toContain(`${ORIGIN}/en/newsletter/unsubscribe/?id=${id}&s=${uuid}`)
      const headers = await mailpit!.headers(welcome.ID)
      expect(headers['List-Unsubscribe']?.map((value) => value.trim())).toEqual([
        `<${ORIGIN}/en/newsletter/unsubscribe/use/?id=${id}&s=${uuid}>`,
      ])
      expect(headers['List-Unsubscribe-Post']).toEqual(['List-Unsubscribe=One-Click'])
      expect(headers['Auto-Submitted']).toEqual(['auto-generated'])
      // The confirmation email has none: nobody is subscribed while it is read.
      const confirmation = (await mailpit!.to(email)).find((mail) =>
        mail.Subject.startsWith('Confirm'),
      )!
      expect((await mailpit!.headers(confirmation.ID))['List-Unsubscribe']).toBeUndefined()
    })

    it('keeps the subscription when the mail server refuses the welcome email', async () => {
      const email = address('unwelcome')
      await signUp(email)
      const token = await emailedToken(email)
      await mailpit!.refuseAll(550)
      let response: Response
      try {
        response = await confirmRoute(token)
      } finally {
        await mailpit!.refuseAll(null)
      }
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/en/newsletter/confirmed/')
      const held = await heldBy(email)
      expect(held).toEqual([
        {
          id: expect.any(Number),
          uuid: expect.any(String),
          list: 'Glia Notes',
          status: 'confirmed',
        },
      ])
      expect((await consentOf(held[0]!.uuid)).map((row) => row.event)).toEqual([
        'requested',
        'confirmed',
      ])
      expect(
        (await mailpit!.to(email)).filter(
          (mail) => mail.Subject === 'You are subscribed to Glia Notes',
        ),
      ).toEqual([])
    })

    it('unsubscribes with one click: the address is gone from listmonk, with a record, a logged deletion and no pending link', async () => {
      const email = address('leave')
      const { uuid, id } = await subscribed(email)
      // A link asked for later (the form again) no longer subscribes the address once it left.
      await signUp(email)
      expect(await pendingTokens(email)).toHaveLength(1)
      const now = new Date()
      const response = await handleUnsubscribe(oneClick(id, uuid), unsubscribing(now))
      expect(response.status).toBe(200)
      expect(await heldBy(email)).toEqual([])
      expect(
        (await consentOf(uuid)).map((row) => [
          row.event,
          row.source,
          row.consent_version,
          row.subscriber_id,
        ]),
      ).toEqual([
        ['requested', 'newsletter-form', GLIA_NOTES_CONSENT_VERSION, id],
        ['confirmed', 'newsletter-form', GLIA_NOTES_CONSENT_VERSION, id],
        ['unsubscribed', 'one-click', null, id],
      ])
      expect(
        await rows(
          payload,
          // At this moment: listmonk's IDs start at 1 in every test file's listmonk, and the
          // members' tests log the same IDs (glia-notes-members.db.test.ts).
          sql`select action from deletion_log where target_collection = 'newsletter'
            and target_id = ${id} and at = ${now.toISOString()}`,
        ),
      ).toEqual([{ action: 'delete' }])
      expect(
        await rows(
          payload,
          sql`select id from email_tokens where purpose = 'newsletter' and email = ${email}`,
        ),
      ).toEqual([])
      // Again: the same answer, nothing more recorded.
      expect((await handleUnsubscribe(oneClick(id, uuid), unsubscribing(now))).status).toBe(200)
      expect(await consentOf(uuid)).toHaveLength(3)
    })

    it('does nothing for a link whose UUID is not its subscriber’s', async () => {
      const email = address('guess')
      const { uuid, id } = await subscribed(email)
      const other = `${uuid.slice(0, -1)}${uuid.endsWith('0') ? '1' : '0'}`
      const response = await handleUnsubscribe(oneClick(id, other), unsubscribing(new Date()))
      expect(response.status).toBe(200)
      expect(await heldBy(email)).toHaveLength(1)
      expect(await consentOf(uuid)).toHaveLength(2)
    })

    it('deletes a subscriber again after a restore of listmonk, and spares a newer one with its ID', async () => {
      const email = address('revived')
      const { uuid, id } = await subscribed(email)
      const [created] = await inListmonk<{ created_at: Date | string }>(
        sql`select created_at from subscribers where id = ${id}`,
      )
      const createdAt = new Date(created!.created_at)
      const loggedAt = later(1000)
      const subscriber = { id, uuid, email, createdAt }
      await recordUnsubscribe(payload, subscriber, 'unsubscribe-link', loggedAt)
      await client.remove(id)
      const [glia] = await inListmonk<{ id: number }>(
        sql`select id from lists where name = 'Glia Notes'`,
      )
      const list = glia!.id
      /** A restore of listmonk's database: the subscriber is back, with its old ID. */
      const restore = async (created: Date, who = email) => {
        await inListmonk(sql`
        insert into subscribers (id, uuid, email, name, status, created_at, updated_at)
        values (${id}, gen_random_uuid(), ${who}, 'Subscriber', 'enabled', ${created.toISOString()},
          ${created.toISOString()})`)
        await inListmonk(sql`
        insert into subscriber_lists (subscriber_id, list_id, status)
        values (${id}, ${list}, 'confirmed')`)
      }

      await restore(createdAt)
      expect(await heldBy(email)).toHaveLength(1)
      const run = new Date(loggedAt.getTime() + 60_000)
      const counts = await applyDeletionLog(payload, run)
      expect(counts.subscribers).toBeGreaterThanOrEqual(1)
      expect(counts.failed).toBe(0)
      expect(await heldBy(email)).toEqual([])

      // Someone who subscribed after the restore got the logged ID: kept.
      const newer = address('newer')
      await restore(new Date(loggedAt.getTime() + DAY), newer)
      await applyDeletionLog(payload, run)
      expect(await heldBy(newer)).toHaveLength(1)
      await client.remove(id)

      // listmonk unreachable: this part stops for the run, counted.
      const url = process.env.LISTMONK_URL
      process.env.LISTMONK_URL = `http://127.0.0.1:${await freePort()}`
      try {
        const down = await applyDeletionLog(payload, run)
        expect(down.subscribers).toBe(0)
        expect(down.subscriptionsEnded).toBe(0)
        expect(down.failed).toBe(1)
      } finally {
        process.env.LISTMONK_URL = url
      }
    })

    it('spares an address that signed up again while its deletion failed, until it unsubscribes again', async () => {
      const email = address('back')
      const { uuid, id } = await subscribed(email)
      // Unsubscribed, but listmonk's deletion failed: the deletion log would repeat it.
      const leftAt = later(1000)
      expect(
        (await handleUnsubscribe(oneClick(id, uuid), unsubscribing(leftAt, failingRemove())))
          .status,
      ).toBe(200)
      expect(await heldBy(email)).toHaveLength(1)
      // The person signs up again and confirms: listmonk still has the address (the same
      // subscriber), so it is added to the list again, with new consent records.
      await signUp(email)
      const again = await confirmSignup(payload, client, await emailedToken(email), later(2000))
      expect(again).toMatchObject({ id, uuid })
      const kept = await applyDeletionLog(payload, later(3000))
      expect(kept.failed).toBe(0)
      expect(await heldBy(email)).toEqual([{ id, uuid, list: 'Glia Notes', status: 'confirmed' }])
      // Unsubscribing again (and the deletion failing again): the next run deletes it.
      await handleUnsubscribe(oneClick(id, uuid), unsubscribing(later(4000), failingRemove()))
      expect(await heldBy(email)).toHaveLength(1)
      const deleted = await applyDeletionLog(payload, later(5000))
      expect(deleted.subscribers).toBeGreaterThanOrEqual(1)
      expect(await heldBy(email)).toEqual([])
    })

    it('records the end of a subscription listmonk no longer has, once, and of no other', async () => {
      const gone = address('gone')
      const stays = address('stays')
      const lost = await subscribed(gone)
      const live = await subscribed(stays)
      // Deleted in listmonk without the site (its admin, or a restore that lost it).
      await inListmonk(sql`delete from subscribers where id = ${lost.id}`)
      const now = later(1000)
      const counts = await applyDeletionLog(payload, now)
      expect(counts.failed).toBe(0)
      expect(counts.subscriptionsEnded).toBeGreaterThanOrEqual(1)
      expect((await consentOf(lost.uuid)).map((row) => [row.event, row.source])).toEqual([
        ['requested', 'newsletter-form'],
        ['confirmed', 'newsletter-form'],
        ['unsubscribed', 'listmonk'],
      ])
      expect((await consentOf(lost.uuid)).at(-1)).toMatchObject({
        subscriber_id: lost.id,
        consent_version: null,
        at: now.toISOString(),
      })
      expect(await consentOf(live.uuid)).toHaveLength(2)
      // A second run records nothing more.
      await applyDeletionLog(payload, later(2000))
      expect(await consentOf(lost.uuid)).toHaveLength(3)
      expect(await consentOf(live.uuid)).toHaveLength(2)

      // An ID listmonk gave to someone else (a restore set its IDs back) is an end too.
      const reused = address('reused')
      const before = await subscribed(reused)
      await inListmonk(sql`update subscribers set uuid = gen_random_uuid() where id = ${before.id}`)
      await applyDeletionLog(payload, later(3000))
      expect((await consentOf(before.uuid)).at(-1)).toMatchObject({
        event: 'unsubscribed',
        source: 'listmonk',
      })
    })

    it('never asked listmonk with an SQL expression (`query`, which its API user may not use)', () => {
      expect(asked.length).toBeGreaterThan(20)
      expect(asked.filter((url) => /[?&]query=/.test(url))).toEqual([])
      // The list was read by its ID, page by page, and subscribers looked up by their ID.
      expect(asked.some((url) => /\/api\/subscribers\?.*list_id=/.test(url))).toBe(true)
      expect(asked.some((url) => /\/api\/subscribers\/\d+$/.test(url))).toBe(true)
    })
  },
)

describe('the consent log', () => {
  const UUID = (n: number) => `0b2c6f8e-3f0a-4c1e-9d55-${String(n).padStart(12, '0')}`
  const failure = async (query: ReturnType<typeof sql>) => {
    try {
      await store.execute(query)
    } catch (error) {
      const cause = (error as { cause?: { code?: string }; code?: string }).cause
      return cause?.code ?? (error as { code?: string }).code
    }
    return 'no error'
  }

  it('refuses what a record never holds: an address, a missing version, a source that does not fit', async () => {
    const now = new Date()
    for (const record of [
      {
        subscriberUuid: UUID(1).toUpperCase(),
        subscriberId: 1,
        event: 'requested',
        consentVersion: 'v1',
      },
      { subscriberUuid: UUID(1), subscriberId: 1, event: 'confirmed', consentVersion: null },
      {
        subscriberUuid: UUID(1),
        subscriberId: 1,
        event: 'confirmed',
        consentVersion: 'someone@example.org',
      },
      { subscriberUuid: UUID(1), subscriberId: null, event: 'requested', consentVersion: 'v1' },
      { subscriberUuid: null, subscriberId: 1, event: 'requested', consentVersion: 'v1' },
    ] as const) {
      const error = await recordConsent(
        store,
        [{ ...record, source: 'newsletter-form', at: now }],
        now,
      ).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(NewsletterStoreError)
      expect(String(error)).not.toContain('example.org')
    }
    const insert = (values: ReturnType<typeof sql>) =>
      failure(sql`insert into consent_log (subscriber_uuid, subscriber_id, event, consent_version,
        source, at) values ${values}`)
    for (const [values, name] of [
      [sql`('not-a-uuid', 1, 'unsubscribed', null, 'one-click', now())`, 'uuid'],
      [sql`(${UUID(2)}, 2, 'confirmed', null, 'newsletter-form', now())`, 'version'],
      [sql`(${UUID(2)}, 2, 'confirmed', 'a@b.org', 'newsletter-form', now())`, 'version format'],
      [sql`(${UUID(2)}, 2, 'requested', 'v1', 'one-click', now())`, 'source'],
      [sql`(${UUID(2)}, 2, 'unsubscribed', null, 'newsletter-form', now())`, 'source'],
      [sql`(${UUID(2)}, 2, 'confirmed', 'v1', 'listmonk', now())`, 'source listmonk'],
      [sql`(${UUID(2)}, null, 'unsubscribed', null, 'one-click', now())`, 'uuid without id'],
      [sql`(null, 2, 'unsubscribed', null, 'one-click', now())`, 'id without uuid'],
      [sql`(${UUID(2)}, 0, 'unsubscribed', null, 'one-click', now())`, 'id 0'],
      [sql`(${UUID(2)}, 1.5, 'unsubscribed', null, 'one-click', now())`, 'id 1.5'],
      [sql`(${UUID(2)}, 2147483648, 'unsubscribed', null, 'one-click', now())`, 'id too large'],
    ] as const) {
      expect(await insert(values), name).toBe('23514')
    }
    expect(
      await insert(sql`(${UUID(3)}, 3, 'unsubscribed', null, 'listmonk', now())`),
      'an end noted from listmonk',
    ).toBe('no error')
  })

  it('is deleted 3 years after the subscription ended, or after its own time once unlinked', async () => {
    const now = new Date()
    const ago = (days: number) => new Date(now.getTime() - days * DAY)
    const YEARS_3 = 3 * 365 + 2
    const [ended, recent, active, noted] = [UUID(101), UUID(102), UUID(103), UUID(104)]
    const record = (
      uuid: string | null,
      event: 'requested' | 'confirmed' | 'unsubscribed',
      at: Date,
      source?: 'listmonk',
    ) => ({
      subscriberUuid: uuid,
      subscriberId: uuid ? 100 : null,
      event,
      consentVersion: event === 'unsubscribed' ? null : '2023-01-01',
      source:
        source ??
        (event === 'unsubscribed' ? ('unsubscribe-link' as const) : ('newsletter-form' as const)),
      at,
    })
    await recordConsent(
      store,
      [
        record(ended, 'requested', ago(YEARS_3 + 400)),
        record(ended, 'confirmed', ago(YEARS_3 + 399)),
        record(ended, 'unsubscribed', ago(YEARS_3)),
        record(recent, 'confirmed', ago(YEARS_3 + 399)),
        record(recent, 'unsubscribed', ago(700)),
        record(active, 'confirmed', ago(YEARS_3 + 399)),
        // Ended outside the site, and noted by the site (source listmonk), 3 years ago.
        record(noted, 'confirmed', ago(YEARS_3 + 399)),
        record(noted, 'unsubscribed', ago(YEARS_3), 'listmonk'),
        record(null, 'unsubscribed', ago(YEARS_3)),
        record(null, 'unsubscribed', ago(700)),
      ],
      now,
    )
    const left = async () =>
      rows<{ subscriber_uuid: string | null; event: string }>(
        payload,
        sql`select subscriber_uuid, event from consent_log
          where subscriber_uuid in (${ended}, ${recent}, ${active}, ${noted})
            or (subscriber_uuid is null and created_at = ${now.toISOString()})
          order by id`,
      )
    expect(await left()).toHaveLength(10)
    const counts = await purgeRetention(payload, now)
    expect(counts.consentLog).toBeGreaterThanOrEqual(6)
    expect(await left()).toEqual([
      { subscriber_uuid: recent, event: 'confirmed' },
      { subscriber_uuid: recent, event: 'unsubscribed' },
      { subscriber_uuid: active, event: 'confirmed' },
      { subscriber_uuid: null, event: 'unsubscribed' },
    ])
    // A second run changes nothing.
    await purgeRetention(payload, now)
    expect(await left()).toHaveLength(4)
  })
})

describe('pending signups', () => {
  it('are deleted by purgeMemberAuth once their 7 days are up', async () => {
    const now = new Date()
    const signup = (at: Date) => ({
      version: GLIA_NOTES_CONSENT_VERSION,
      source: 'newsletter-form',
      requestedAt: at.toISOString(),
    })
    const old = address('pending-old')
    const fresh = address('pending-new')
    const oldAt = new Date(now.getTime() - 7 * DAY - 1)
    const freshAt = new Date(now.getTime() - 6 * DAY)
    await createEmailToken(
      store,
      { purpose: 'newsletter', email: old, locale: 'en', requestData: signup(oldAt) },
      oldAt,
    )
    await createEmailToken(
      store,
      { purpose: 'newsletter', email: fresh, locale: 'en', requestData: signup(freshAt) },
      freshAt,
    )
    expect((await purgeMemberAuth(payload, now)).emailLinks).toBeGreaterThanOrEqual(1)
    const left = await rows<{ email: string }>(
      payload,
      sql`select email from email_tokens where email in (${old}, ${fresh})`,
    )
    expect(left).toEqual([{ email: fresh }])
  })
})
