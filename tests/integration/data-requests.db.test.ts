import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import type { CollectionBeforeChangeHook, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyDeletionLog } from '@/jobs/maintenance/applyDeletionLog'
import { purgeDataRequests } from '@/jobs/maintenance/purgeRetention'
import { sendRequestEmails } from '@/jobs/maintenance/sendRequestEmails'
import { requestAddressHash } from '@/lib/data-requests/address'
import { confirmDataRequest } from '@/lib/data-requests/confirm'
import {
  discardDataRequest,
  recordAndSendDataRequest,
  recordDataRequest,
} from '@/lib/data-requests/record'
import type { DataRequestData } from '@/lib/forms/data-request-schema'
import {
  type MemberDb,
  createMember,
  createSession,
  findEmailToken,
  findMember,
  memberDb,
} from '@/lib/members/store'

import { DAY, HOUR, rows, suggestion, testPayload, unique } from './helpers'
import { type Mailpit, mailpitAvailable, startMailpit } from './mailpit'

// The data-request form's requests (M4b, D49; the M4b design §7.8, §7.9, §9) against a real,
// migrated database and, for the final email, a throwaway Mailpit (a container, or the program in
// MAILPIT_BIN): the minimal record of a request nobody confirmed, the deletion a confirmed link
// does (suggestions found without regard to case, the account, report addresses except requests
// about personal rights, each logged) or, when it fails half-way, does not, other requests recorded
// for an editor, what an editor can and cannot do to a request, the confirmation email the form
// sends (and what is deleted when it cannot be sent), the final email from the record, the purges,
// and the deletion log repeated after a restore. Every assertion is about the test's own records:
// the scratch database is shared with the other integration tests.

const SECRET = process.env.PAYLOAD_SECRET ?? 'test-data-only'
const canStartMailpit = await mailpitAvailable()

let mailpit: Mailpit | undefined
let payload: Payload
let store: MemberDb

beforeAll(async () => {
  if (canStartMailpit) mailpit = await startMailpit({ chaos: true })
  payload = await testPayload(
    mailpit
      ? {
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: String(mailpit.smtpPort),
          SMTP_SECURE: 'false',
          EMAIL_FROM: 'Gliagora <hello@gliagora.com>',
        }
      : {},
  )
  store = memberDb(payload)
})

afterAll(async () => {
  await payload?.destroy()
  await mailpit?.stop()
})

const address = (prefix: string) => `${unique(prefix)}@example.org`

const iso = (value: Date | string | null | undefined) =>
  value == null ? null : new Date(value).toISOString()

type RequestRow = {
  id: number
  kind: string
  source: string
  status: string
  action: string | null
  action_note: string | null
  email: string | null
  name: string | null
  details: string | null
  email_hash: string | null
  outcome: Record<string, number> | null
  received_at: Date
  respond_by: Date | null
  closed_at: Date | null
  purge_at: Date | null
  confirmation_sent_at: Date | null
}

const record = async (id: number) =>
  (await rows<RequestRow>(payload, sql`select * from data_requests where id = ${id}`))[0] ?? null

const logged = async (collection: string, id: number) =>
  (
    await rows<{ action: string }>(
      payload,
      sql`select action from deletion_log where target_collection = ${collection} and target_id = ${id}`,
    )
  ).map((row) => row.action)

/** A request as the form sends it, already checked (src/lib/forms/data-request-schema.ts). */
const request = (email: string, fields: Partial<DataRequestData> = {}): DataRequestData => ({
  email,
  kind: 'deletion',
  name: null,
  details: null,
  locale: 'en',
  ...fields,
})

/** A report as "Report a problem" stores it, sent with `email` as typed. */
async function report(email: string, kind: 'wrong-fact' | 'personal-rights' = 'wrong-fact') {
  const created = await payload.create({
    collection: 'reports',
    data: {
      kind,
      details: 'Fake data (integration test). Something is wrong.',
      email,
      locale: 'en',
      status: 'new',
    },
    overrideAccess: true,
    depth: 0,
  })
  return created.id
}

/** The SQLSTATE of the error `query` ends with, or 'no error'. */
async function sqlError(query: SQL) {
  try {
    await store.execute(query)
  } catch (error) {
    const cause = (error as { cause?: { code?: string }; code?: string }).cause
    return cause?.code ?? (error as { code?: string }).code
  }
  return 'no error'
}

const reportEmail = async (id: number) =>
  (
    await rows<{ email: string | null }>(payload, sql`select email from reports where id = ${id}`)
  )[0]?.email

describe('a request from the form', () => {
  it('is recorded at once with only its kind, date and address code; the link keeps the rest', async () => {
    const now = new Date()
    const email = address('asking')
    const { requestId, token } = await recordDataRequest(
      payload,
      request(email, { kind: 'correction', name: 'Ada Example', details: 'My city is wrong.' }),
      SECRET,
      now,
    )
    const saved = await record(requestId)
    expect(saved).toMatchObject({
      kind: 'correction',
      source: 'form',
      status: 'unconfirmed',
      email: null,
      name: null,
      details: null,
      action: null,
      respond_by: null,
      closed_at: null,
      email_hash: requestAddressHash(email, SECRET),
    })
    expect(iso(saved!.received_at)).toBe(now.toISOString())
    expect(iso(saved!.purge_at)).toBe(new Date(now.getTime() + 60 * DAY).toISOString())

    const link = await findEmailToken(store, token, now)
    expect(link).toMatchObject({
      purpose: 'data-request',
      email,
      requestId,
      locale: 'en',
      requestData: { kind: 'correction', name: 'Ada Example', details: 'My city is wrong.' },
    })
    expect(link!.expiresAt.getTime() - now.getTime()).toBe(DAY)
  })

  it('keeps the longest name and details the form takes, whatever their characters', async () => {
    const now = new Date()
    // Each of these characters takes two in JSON.
    const details = '"\\\n'.repeat(666) + '""'
    const name = '\\'.repeat(200)
    expect(details).toHaveLength(2000)
    const { token } = await recordDataRequest(
      payload,
      request(address('long'), { kind: 'other', name, details }),
      SECRET,
      now,
    )
    expect((await findEmailToken(store, token, now))?.requestData).toEqual({
      kind: 'other',
      name,
      details,
    })
  })

  it('is deleted again, with its link, when the confirmation email could not be sent', async () => {
    const now = new Date()
    const { requestId, token } = await recordDataRequest(
      payload,
      request(address('unsent')),
      SECRET,
      now,
    )
    await discardDataRequest(payload, requestId, token)
    expect(await record(requestId)).toBeNull()
    expect(await findEmailToken(store, token, now)).toBeNull()
  })

  it('is deleted 60 days after it arrived if nobody confirmed it', async () => {
    const now = new Date()
    const old = await recordDataRequest(
      payload,
      request(address('old')),
      SECRET,
      new Date(now.getTime() - 61 * DAY),
    )
    const recent = await recordDataRequest(
      payload,
      request(address('recent')),
      SECRET,
      new Date(now.getTime() - 59 * DAY),
    )
    const purged = await purgeDataRequests(payload, now)
    expect(purged.unconfirmed).toBeGreaterThanOrEqual(1)
    expect(await record(old.requestId)).toBeNull()
    expect(await record(recent.requestId)).not.toBeNull()
  })
})

describe('confirming a deletion', () => {
  it('deletes by address whatever its case: suggestions, the account, report addresses but not personal-rights requests; all logged', async () => {
    const now = new Date()
    const email = address('erase')
    const typed = email.toUpperCase()
    const sent = await suggestion(payload, { email: typed, consent: true })
    const other = await suggestion(payload, { email: address('other'), consent: true })
    const member = await createMember(store, { email, emailVerifiedBy: 'link' }, now)
    await createSession(store, member.id, now)
    const problem = await report(typed)
    const rights = await report(email, 'personal-rights')
    const unrelated = await report(address('unrelated'))

    const { requestId, token } = await recordDataRequest(payload, request(email), SECRET, now)
    const confirmed = await confirmDataRequest(payload, token, now)
    const outcome = {
      suggestionsDeleted: 1,
      accountDeleted: 1,
      newsletterRemoved: 0,
      reportAddressesCleared: 1,
      personalRightsReportsKept: 1,
    }
    expect(confirmed).toEqual({ kind: 'deleted', outcome })

    // The suggestion is gone; its candidate keeps the decision, without it.
    expect(await rows(payload, sql`select id from submissions where id = ${sent.id}`)).toEqual([])
    expect(
      await rows(payload, sql`select submission_id from candidates where id = ${sent.candidateId}`),
    ).toEqual([{ submission_id: null }])
    expect(
      await rows(payload, sql`select id from submissions where id = ${other.id}`),
    ).toHaveLength(1)
    expect(await findMember(store, { id: member.id })).toBeNull()
    expect(
      await rows(payload, sql`select id from member_sessions where member_id = ${member.id}`),
    ).toEqual([])
    expect(await reportEmail(problem)).toBeNull()
    expect(await reportEmail(rights)).toBe(email)
    expect(await reportEmail(unrelated)).not.toBeNull()

    expect(await logged('submissions', sent.id)).toEqual(['delete'])
    expect(await logged('members', member.id)).toEqual(['delete'])
    expect(await logged('reports', problem)).toEqual(['clear-email'])
    expect(await logged('reports', rights)).toEqual([])

    const closed = await record(requestId)
    expect(closed).toMatchObject({
      kind: 'deletion',
      source: 'form',
      status: 'closed',
      action: 'deleted-automatically',
      email,
      name: null,
      details: null,
      outcome,
      confirmation_sent_at: null,
    })
    // Due 30 days after it arrived, closed now, deleted 2 years after closing.
    expect(iso(closed!.respond_by)).toBe(new Date(now.getTime() + 30 * DAY).toISOString())
    const years =
      (new Date(closed!.purge_at!).getTime() - new Date(closed!.closed_at!).getTime()) / DAY / 365
    expect(years).toBeGreaterThan(1.99)
    expect(years).toBeLessThan(2.01)

    // The link worked once.
    expect(await confirmDataRequest(payload, token, now)).toBeNull()
  })

  it('records nothing deleted for an address with no data, and still closes the request', async () => {
    const now = new Date()
    const { requestId, token } = await recordDataRequest(
      payload,
      request(address('nothing')),
      SECRET,
      now,
    )
    expect(await confirmDataRequest(payload, token, now)).toEqual({
      kind: 'deleted',
      outcome: {
        suggestionsDeleted: 0,
        accountDeleted: 0,
        newsletterRemoved: 0,
        reportAddressesCleared: 0,
        personalRightsReportsKept: 0,
      },
    })
    expect((await record(requestId))?.status).toBe('closed')
  })

  it('changes nothing, and keeps the link, when something goes wrong half-way', async () => {
    const now = new Date()
    const email = address('rollback')
    const sent = await suggestion(payload, { email, consent: true })
    const problem = await report(email)
    const member = await createMember(store, { email, emailVerifiedBy: 'link' }, now)
    await createSession(store, member.id, now)
    const { requestId, token } = await recordDataRequest(payload, request(email), SECRET, now)
    // The record cannot be closed: the failure comes in settle(), after every deletion. A plain
    // function, as the transaction runs on another connection of the pool than this one.
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
    try {
      await expect(confirmDataRequest(payload, token, now)).rejects.toThrow()
    } finally {
      await store.execute(sql`DROP TRIGGER IF EXISTS ${name} ON data_requests`)
      await store.execute(sql`DROP FUNCTION IF EXISTS ${name}()`)
    }

    expect(await rows(payload, sql`select id from submissions where id = ${sent.id}`)).toHaveLength(
      1,
    )
    expect(await reportEmail(problem)).toBe(email)
    expect(await findMember(store, { id: member.id })).not.toBeNull()
    expect(
      await rows(payload, sql`select id from member_sessions where member_id = ${member.id}`),
    ).toHaveLength(1)
    expect(await logged('submissions', sent.id)).toEqual([])
    expect(await logged('members', member.id)).toEqual([])
    expect(await logged('reports', problem)).toEqual([])
    expect(await record(requestId)).toMatchObject({
      status: 'unconfirmed',
      email: null,
      outcome: null,
    })
    // The link still works.
    expect(await findEmailToken(store, token, now)).not.toBeNull()
  })

  it('changes nothing when the site cannot read its own link', async () => {
    const now = new Date()
    const email = address('unreadable')
    const sent = await suggestion(payload, { email, consent: true })
    const { requestId, token } = await recordDataRequest(payload, request(email), SECRET, now)
    await store.execute(sql`
      update email_tokens set request_data = '{"kind":"remove"}'::jsonb
      where request_id = ${requestId}`)
    await expect(confirmDataRequest(payload, token, now)).rejects.toThrow()
    expect(await findEmailToken(store, token, now)).not.toBeNull()
    expect(await rows(payload, sql`select id from submissions where id = ${sent.id}`)).toHaveLength(
      1,
    )
    expect((await record(requestId))?.status).toBe('unconfirmed')
  })

  it('works only for its own purpose and before it expires', async () => {
    const now = new Date()
    const { token } = await recordDataRequest(payload, request(address('late')), SECRET, now)
    expect(await confirmDataRequest(payload, token, new Date(now.getTime() + DAY + 1))).toBeNull()
    expect(await confirmDataRequest(payload, 'x'.repeat(43), now)).toBeNull()
    expect(await confirmDataRequest(payload, null, now)).toBeNull()
  })
})

describe('confirming another request', () => {
  it('records the address, the name and the details, as New, due 30 days after it arrived', async () => {
    // Confirmed some hours after it arrived: the 30 days count from its arrival.
    const received = new Date(Date.now() - 20 * HOUR)
    const email = address('access')
    const sent = await suggestion(payload, { email, consent: true })
    const { requestId, token } = await recordDataRequest(
      payload,
      request(email, { kind: 'access', name: 'Ada Example', details: 'A copy, please.' }),
      SECRET,
      received,
    )
    expect(await confirmDataRequest(payload, token, new Date())).toEqual({ kind: 'registered' })
    const saved = await record(requestId)
    expect(saved).toMatchObject({
      kind: 'access',
      status: 'new',
      email,
      name: 'Ada Example',
      details: 'A copy, please.',
      action: null,
      closed_at: null,
      purge_at: null,
    })
    expect(iso(saved!.respond_by)).toBe(new Date(received.getTime() + 30 * DAY).toISOString())
    // Nothing is deleted: an editor answers it.
    expect(await rows(payload, sql`select id from submissions where id = ${sent.id}`)).toHaveLength(
      1,
    )
  })

  it('is recorded anew if a restore lost its minimal record', async () => {
    const now = new Date()
    const email = address('restored')
    const { requestId, token } = await recordDataRequest(
      payload,
      request(email, { kind: 'objection', details: 'Fake objection.' }),
      SECRET,
      now,
    )
    await store.execute(sql`delete from data_requests where id = ${requestId}`)
    expect(await confirmDataRequest(payload, token, now)).toEqual({ kind: 'registered' })
    const [found, ...more] = await rows<RequestRow>(
      payload,
      sql`select * from data_requests where email = ${email}`,
    )
    expect(more).toEqual([])
    expect(found).toMatchObject({
      kind: 'objection',
      source: 'form',
      status: 'new',
      details: 'Fake objection.',
    })
  })
})

describe('what an editor can do to a request', () => {
  let editor: Record<string, unknown>

  beforeAll(async () => {
    const created = await payload.create({
      collection: 'users',
      data: { email: address('editor'), password: randomBytes(16).toString('hex') },
      overrideAccess: true,
      depth: 0,
    })
    editor = { ...created, collection: 'users' }
  })

  /** An editor's save, as from the admin or the API. */
  const editorSave = (id: number, data: Record<string, unknown>) =>
    payload.update({
      collection: 'data-requests',
      id,
      data,
      user: editor as never,
      overrideAccess: false,
      depth: 0,
    })

  /**
   * Holds the next save of request `id` by an editor between reading the request and writing it,
   * as a slow save would be; `reached` resolves once it waits there.
   */
  function holdEditorSave(id: number) {
    let entered: () => void = () => {}
    const reached = new Promise<void>((resolve) => (entered = resolve))
    let resume: () => void = () => {}
    const resumed = new Promise<void>((resolve) => (resume = resolve))
    const hooks = payload.collections['data-requests'].config.hooks
    const hold: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
      if (originalDoc?.id === id && req.user) {
        entered()
        await resumed
      }
      return data
    }
    hooks.beforeChange = [...(hooks.beforeChange ?? []), hold]
    return {
      reached,
      release() {
        resume()
        hooks.beforeChange = hooks.beforeChange.filter((hook) => hook !== hold)
      },
    }
  }

  it('adds no note or action to an unconfirmed request, and the database refuses them', async () => {
    const now = new Date()
    const { requestId } = await recordDataRequest(payload, request(address('quiet')), SECRET, now)
    const minimal = { status: 'unconfirmed', action: null, action_note: null, email: null }

    // The admin shows both read-only; what an editor sends anyway is dropped.
    await editorSave(requestId, {
      actionNote: 'Sent by someone@example.org, asked to resend the link.',
      action: 'not-applicable',
    })
    expect(await record(requestId)).toMatchObject(minimal)

    // Code that bypasses access control is refused.
    await expect(
      payload.update({
        collection: 'data-requests',
        id: requestId,
        data: { actionNote: 'A note.' },
        depth: 0,
      }),
    ).rejects.toThrow(/invalid: actionNote/)
    expect(await record(requestId)).toMatchObject(minimal)

    // And so is SQL.
    for (const change of [
      sql`action_note = 'A note.'`,
      sql`action = 'not-applicable'`,
      sql`outcome = '{"suggestionsDeleted": 1}'::jsonb`,
    ]) {
      expect(await sqlError(sql`update data_requests set ${change} where id = ${requestId}`)).toBe(
        '23514',
      )
    }
    expect(await record(requestId)).toMatchObject(minimal)
  })

  it('notes what was done once the request is confirmed', async () => {
    const now = new Date()
    const { requestId, token } = await recordDataRequest(
      payload,
      request(address('noted'), { kind: 'access', details: 'A copy, please.' }),
      SECRET,
      now,
    )
    await confirmDataRequest(payload, token, now)
    await editorSave(requestId, { status: 'in-progress', actionNote: 'Sent the copy by email.' })
    expect(await record(requestId)).toMatchObject({
      status: 'in-progress',
      action_note: 'Sent the copy by email.',
    })
  })

  it('cannot put a request back to unconfirmed with a save that read it before it was confirmed', async () => {
    const now = new Date()
    for (const fields of [
      { kind: 'other', details: 'Fake question about my data.' },
      { kind: 'deletion' },
    ] as const) {
      const email = address(`stale-${fields.kind}`)
      const { requestId, token } = await recordDataRequest(
        payload,
        request(email, fields),
        SECRET,
        now,
      )
      // The editor's save reads the request while it is unconfirmed, the person confirms it, then
      // the save writes the whole request as it read it.
      const held = holdEditorSave(requestId)
      const save = editorSave(requestId, { status: 'unconfirmed' })
      try {
        await held.reached
        expect((await confirmDataRequest(payload, token, now))?.kind).toBe(
          fields.kind === 'deletion' ? 'deleted' : 'registered',
        )
      } finally {
        held.release()
      }
      await expect(save).rejects.toThrow()
      expect(await record(requestId)).toMatchObject(
        fields.kind === 'deletion'
          ? {
              status: 'closed',
              action: 'deleted-automatically',
              email,
              outcome: expect.any(Object),
            }
          : { status: 'new', email, details: fields.details },
      )
    }

    // Nor can SQL; and what the confirmation stored stays.
    const email = address('stale-sql')
    const { requestId, token } = await recordDataRequest(payload, request(email), SECRET, now)
    await confirmDataRequest(payload, token, now)
    expect(
      await sqlError(sql`
        update data_requests set status = 'unconfirmed', email = null, outcome = null,
          action = null, closed_at = null, respond_by = null
        where id = ${requestId}`),
    ).toBe('23514')
    await store.execute(
      sql`update data_requests set email = null, outcome = null where id = ${requestId}`,
    )
    expect(await record(requestId)).toMatchObject({
      status: 'closed',
      email,
      outcome: expect.objectContaining({ accountDeleted: 0 }),
    })
  })
})

describe.skipIf(!canStartMailpit)('the confirmation email of the form, through Mailpit', () => {
  const send = (email: string) =>
    recordAndSendDataRequest(payload, request(email), {
      origin: 'https://gliagora.example',
      secret: SECRET,
      now: new Date(),
    })

  /** The request recorded for `email`, and its link, if any. */
  const kept = async (email: string) => ({
    requests: await rows<{ id: number; status: string }>(
      payload,
      sql`select id, status from data_requests
        where email_hash = ${requestAddressHash(email, SECRET)}`,
    ),
    links: await rows<{ id: number }>(
      payload,
      sql`select id from email_tokens where email = ${email} and purpose = 'data-request'`,
    ),
  })

  it('records the request and its link once the mail server took the email', async () => {
    const email = address('confirm-sent')
    expect(await send(email)).toBeUndefined()
    const { requests, links } = await kept(email)
    expect(requests.map((row) => row.status)).toEqual(['unconfirmed'])
    expect(links).toHaveLength(1)
    const [mail, ...more] = await mailpit!.to(email)
    expect(more).toEqual([])
    expect(mail?.Subject).toBe('Confirm your request to Gliagora')
    expect(mail?.Text).toContain('https://gliagora.example/en/legal/data-requests/confirm/?token=')
  })

  for (const code of [550, 451]) {
    it(`deletes the request and its link again when the mail server refuses the email (${code})`, async () => {
      const email = address(`confirm-${code}`)
      await mailpit!.refuseAll(code)
      try {
        expect(await send(email)).toBe('unavailable')
      } finally {
        await mailpit!.refuseAll(null)
      }
      expect(await kept(email)).toEqual({ requests: [], links: [] })
      expect(await mailpit!.to(email)).toEqual([])
    })
  }
})

describe('the deletion log, after a restore', () => {
  it('deletes the suggestion and clears the report address again', async () => {
    const email = address('revived')
    const sent = await suggestion(payload, { email, consent: true })
    const problem = await report(email)
    // Confirmed after they were sent: only records made no later than a logged deletion are
    // touched again.
    const now = new Date(Date.now() + 1000)
    const [restored] = await rows<{ created_at: Date; url: string }>(
      payload,
      sql`select created_at, url from submissions where id = ${sent.id}`,
    )
    const { created_at: sentAt, url } = restored!
    const { token } = await recordDataRequest(payload, request(email), SECRET, now)
    await confirmDataRequest(payload, token, now)

    // A restore from before the deletion brings the suggestion and the address back.
    await store.execute(sql`
      insert into submissions (id, url, kind, email, consent_to_contact, locale, status,
        created_at, updated_at)
      values (${sent.id}, ${url}, 'position', ${email}, true, 'en', 'new', ${iso(sentAt)},
        ${iso(sentAt)})`)
    await store.execute(sql`update reports set email = ${email} where id = ${problem}`)

    const counts = await applyDeletionLog(payload, new Date(now.getTime() + 60_000))
    expect(counts.failed).toBe(0)
    expect(counts.suggestions).toBeGreaterThanOrEqual(1)
    expect(counts.reportAddresses).toBeGreaterThanOrEqual(1)
    expect(await rows(payload, sql`select id from submissions where id = ${sent.id}`)).toEqual([])
    expect(await reportEmail(problem)).toBeNull()
    // Logged once, by the confirmation: repeating it is not logged again.
    expect(await logged('submissions', sent.id)).toEqual(['delete'])
    expect(await logged('reports', problem)).toEqual(['clear-email'])
  })
})

describe('the record of a confirmed deletion', () => {
  it('is deleted 2 years after it was closed', async () => {
    const now = new Date()
    const { requestId, token } = await recordDataRequest(
      payload,
      request(address('two-years')),
      SECRET,
      now,
    )
    await confirmDataRequest(payload, token, now)
    expect(await purgeDataRequests(payload, new Date(now.getTime() + 700 * DAY))).toBeDefined()
    expect(await record(requestId)).not.toBeNull()
    const later = new Date(now.getTime() + 732 * DAY)
    expect((await purgeDataRequests(payload, later)).closed).toBeGreaterThanOrEqual(1)
    expect(await record(requestId)).toBeNull()
  })
})

describe.skipIf(!canStartMailpit)(
  'sendRequestEmails for confirmed deletions, through Mailpit',
  () => {
    const sentAt = async (id: number) => (await record(id))?.confirmation_sent_at ?? null

    it('emails what was deleted once, after the server accepted it', async () => {
      const now = new Date()
      const email = address('told')
      await suggestion(payload, { email, consent: true })
      await report(email, 'personal-rights')
      const { requestId, token } = await recordDataRequest(payload, request(email), SECRET, now)
      await confirmDataRequest(payload, token, now)

      // Not accepted (the server asks to try later): nothing is marked, and it waits.
      await mailpit!.refuseAll(451)
      try {
        expect((await sendRequestEmails(payload, new Date())).sent).toBe(0)
      } finally {
        await mailpit!.refuseAll(null)
      }
      expect(await sentAt(requestId)).toBeNull()

      expect((await sendRequestEmails(payload, new Date())).sent).toBeGreaterThanOrEqual(1)
      const [mail, ...more] = await mailpit!.to(email)
      expect(more).toEqual([])
      expect(mail?.Subject).toBe('Your data has been deleted from Gliagora')
      expect(mail?.Text).toContain('- 1 suggestion you sent, with its link and note')
      expect(mail?.Text).toContain('We keep this address on 1 request about your personal rights')
      expect(mail?.HTML).toBe('')
      expect(await sentAt(requestId)).not.toBeNull()

      await sendRequestEmails(payload, new Date())
      expect(await mailpit!.to(email)).toHaveLength(1)
    })

    it('emails only deletions of requests received within the last 7 days', async () => {
      const now = new Date()
      const old = address('old-form')
      const recent = address('recent-form')
      const first = await recordDataRequest(
        payload,
        request(old),
        SECRET,
        new Date(now.getTime() - 8 * DAY),
      )
      await confirmDataRequest(payload, first.token, new Date(now.getTime() - 8 * DAY + 1000))
      const second = await recordDataRequest(
        payload,
        request(recent),
        SECRET,
        new Date(now.getTime() - 6 * DAY),
      )
      await confirmDataRequest(payload, second.token, new Date(now.getTime() - 6 * DAY + 1000))
      await sendRequestEmails(payload, now)
      expect(await mailpit!.to(old)).toEqual([])
      expect(await sentAt(first.requestId)).toBeNull()
      expect(await mailpit!.to(recent)).toHaveLength(1)
    })

    it('sends nothing for other confirmed requests, which an editor answers', async () => {
      const now = new Date()
      const email = address('answered')
      const { token } = await recordDataRequest(
        payload,
        request(email, { kind: 'access', details: 'A copy, please.' }),
        SECRET,
        now,
      )
      await confirmDataRequest(payload, token, now)
      await sendRequestEmails(payload, new Date())
      expect(await mailpit!.to(email)).toEqual([])
    })
  },
)
