import { randomInt } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyDeletionLog } from '@/jobs/maintenance/applyDeletionLog'
import { cleanInactiveMembers } from '@/jobs/maintenance/cleanInactiveMembers'
import { purgeMemberAuth } from '@/jobs/maintenance/purgeMemberAuth'
import { purgeDataRequests, purgeDeletionLog } from '@/jobs/maintenance/purgeRetention'
import { sendRequestEmails } from '@/jobs/maintenance/sendRequestEmails'
import { formatDay } from '@/lib/jobs/format'
import { deleteOwnAccount } from '@/lib/members/account-deletion'
import { orcidCheckCharacter } from '@/lib/members/orcid-id'
import {
  type MemberDb,
  type MemberRecord,
  createEmailToken,
  createMember,
  createSession,
  deleteMember,
  findMember,
  memberDb,
  saveJob,
  touchMember,
} from '@/lib/members/store'
import { monthsBeforeUtc, warningDeadlineDay } from '@/lib/retention/rules'

import { DAY, institution, job, rows, suggestion, testPayload, unique } from './helpers'
import { type Mailpit, mailpitAvailable, startMailpit } from './mailpit'

// The member tasks (M4b, D49; the M4b design §7.6, §7.7, §7.9, §9) against a real, migrated
// database and, for the emails, a throwaway Mailpit (a container, or the program in MAILPIT_BIN)
// that refuses every address outside example.org as nonexistent (550 5.1.0 at RCPT TO) and can
// refuse every recipient, or our sender, with a code of the test's choice. The inactivity timeline runs the task at chosen
// moments, as the daily schedule would. Every assertion is about the test's own members and
// addresses: the task looks at every member in the shared scratch database.

const canStartMailpit = await mailpitAvailable()

let mailpit: Mailpit | undefined
let payload: Payload
let store: MemberDb

beforeAll(async () => {
  if (canStartMailpit) {
    mailpit = await startMailpit({ allowedRecipients: '@example\\.org$', chaos: true })
  }
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

/** The moment the tests count from: the task runs at chosen moments after it. */
const T0 = new Date()
const at = (days: number, ms = 0) => new Date(T0.getTime() + days * DAY + ms)
/** `months` calendar months before `when` (as the rules count them), and `extraDays` more. */
const monthsBefore = (when: Date, months: number, extraDays = 0) =>
  new Date(monthsBeforeUtc(when, months).getTime() - extraDays * DAY)

const address = (prefix: string, domain = 'example.org') => `${unique(prefix)}@${domain}`

const orcid = () => {
  const digits = `9999${String(randomInt(0, 99_999_999_999)).padStart(11, '0')}`
  return `${digits}${orcidCheckCharacter(digits)}`.replace(
    /^(\d{4})(\d{4})(\d{4})(.{4})$/,
    '$1-$2-$3-$4',
  )
}

type MemberRow = {
  id: number
  last_seen_at: Date | null
  deletion_warned_at: Date | null
  warning_refused_at: Date | null
}

/** A member with an address (or, with `email: null`, an ORCID iD), last seen at `lastSeen`. */
async function member({
  email = address('member'),
  lastSeen,
  warnedAt = null,
}: {
  email?: string | null
  lastSeen: Date
  warnedAt?: Date | null
}): Promise<MemberRecord> {
  const created = await createMember(
    store,
    email ? { email, emailVerifiedBy: 'link' } : { orcidId: orcid() },
    lastSeen,
  )
  await store.execute(sql`
    update members set last_seen_at = ${lastSeen.toISOString()},
      deletion_warned_at = ${warnedAt?.toISOString() ?? null}
    where id = ${created.id}`)
  return created
}

const state = async (id: number): Promise<MemberRow | null> =>
  (
    await rows<MemberRow>(
      payload,
      sql`select id, last_seen_at, deletion_warned_at, warning_refused_at from members where id = ${id}`,
    )
  )[0] ?? null

const iso = (value: Date | string | null | undefined) =>
  value == null ? null : new Date(value).toISOString()

const logged = async (collection: string, id: number) =>
  (
    await rows<{ action: string }>(
      payload,
      sql`select action from deletion_log where target_collection = ${collection} and target_id = ${id}`,
    )
  ).map((row) => row.action)

describe.skipIf(!canStartMailpit)('inactive members, through Mailpit', () => {
  it('are warned 24 months after their last activity, once the mail server accepted it, and deleted 30 days later', async () => {
    const run = at(0)
    const due = await member({ lastSeen: monthsBefore(run, 24, 1) })
    const notYet = await member({ lastSeen: monthsBefore(run, 24, -1) })

    const first = await cleanInactiveMembers(payload, run)
    expect(first.stopped).toBe(0)
    expect(iso((await state(due.id))?.deletion_warned_at)).toBe(run.toISOString())
    expect((await state(notYet.id))?.deletion_warned_at).toBeNull()
    const [warning, ...more] = await mailpit!.to(due.email!)
    expect(more).toEqual([])
    expect(warning?.Subject).toBe('Your Gliagora account will be deleted')
    expect(warning?.Text).toContain('You have not used your Gliagora | Neuroscience account')
    expect(warning?.Text).toMatch(/\nhttps:\/\/gliagora\.com\/en\/sign-in\/\r?\n/)
    // The day named is the latest before which signing in keeps the account in every time zone.
    const day = formatDay(warningDeadlineDay(run), 'en')
    expect(warning?.Text).toContain(`sign in before ${day}:`)
    expect(warning?.Text).not.toMatch(/token=|\?next=/)
    expect(await mailpit!.to(notYet.email!)).toEqual([])

    // The next day: no second warning.
    await cleanInactiveMembers(payload, at(1))
    expect(await mailpit!.to(due.email!)).toHaveLength(1)

    // 29 days after the warning: kept. 30 days and a minute after: deleted, with no email.
    await cleanInactiveMembers(payload, at(29))
    expect(await state(due.id)).not.toBeNull()
    const later = await cleanInactiveMembers(payload, at(30, 60_000))
    expect(later.deleted).toBeGreaterThanOrEqual(1)
    expect(await state(due.id)).toBeNull()
    expect(await logged('members', due.id)).toEqual(['delete'])
    expect(await mailpit!.to(due.email!)).toHaveLength(1)
    // No data request is recorded for a deletion for inactivity.
    expect(
      await rows(payload, sql`select id from data_requests where email = ${due.email}`),
    ).toEqual([])
  })

  it('keep the account when the member signs in after the warning', async () => {
    const run = at(0)
    const back = await member({ lastSeen: monthsBefore(run, 24, 2) })
    await cleanInactiveMembers(payload, run)
    expect((await state(back.id))?.deletion_warned_at).not.toBeNull()
    // Ten days later the member signs in: the warning is cancelled.
    await createSession(store, back.id, at(10))
    expect((await state(back.id))?.deletion_warned_at).toBeNull()
    await cleanInactiveMembers(payload, at(31))
    expect(await state(back.id)).not.toBeNull()
    expect(await mailpit!.to(back.email!)).toHaveLength(1)

    // Any signed-in request cancels it too (at most once a day).
    const other = await member({ lastSeen: monthsBefore(run, 24, 3) })
    await cleanInactiveMembers(payload, run)
    expect((await state(other.id))?.deletion_warned_at).not.toBeNull()
    expect(await touchMember(store, other.id, at(5))).toBe(true)
    await cleanInactiveMembers(payload, at(31))
    expect(await state(other.id)).not.toBeNull()
  })

  it('stop the warnings of a run at a 4xx reply, marking nobody', async () => {
    const run = at(0)
    const one = await member({ lastSeen: monthsBefore(run, 25) })
    const two = await member({ lastSeen: monthsBefore(run, 25) })
    await mailpit!.refuseAll(451)
    try {
      const stopped = await cleanInactiveMembers(payload, run)
      expect(stopped.stopped).toBe(1)
      expect(stopped.warned).toBe(0)
    } finally {
      await mailpit!.refuseAll(null)
    }
    for (const id of [one.id, two.id]) {
      expect(await state(id)).toMatchObject({ deletion_warned_at: null, warning_refused_at: null })
    }
    // The next run tries again.
    await cleanInactiveMembers(payload, at(1))
    for (const id of [one.id, two.id]) {
      expect(iso((await state(id))?.deletion_warned_at)).toBe(at(1).toISOString())
    }
  })

  it('skip a member whose warning is refused for another reason, and try again next time', async () => {
    const run = at(0)
    const full = await member({ lastSeen: monthsBefore(run, 25) })
    await mailpit!.refuseAll(552)
    try {
      const skipped = await cleanInactiveMembers(payload, run)
      expect(skipped.skipped).toBeGreaterThanOrEqual(1)
      expect(skipped.stopped).toBe(0)
    } finally {
      await mailpit!.refuseAll(null)
    }
    expect(await state(full.id)).toMatchObject({
      deletion_warned_at: null,
      warning_refused_at: null,
    })
    await cleanInactiveMembers(payload, at(1))
    expect((await state(full.id))?.deletion_warned_at).not.toBeNull()
  })

  it('start the 30 days for an address that does not exist only when it is refused again 7 days later', async () => {
    const run = at(0)
    const gone = await member({
      email: address('gone', 'nowhere.example.org'),
      lastSeen: monthsBefore(run, 25),
    })
    // A refusal counts only in a run in which the server accepted another warning.
    const reachable = await member({ lastSeen: monthsBefore(run, 25) })
    const first = await cleanInactiveMembers(payload, run)
    expect(first.refusedOnce).toBeGreaterThanOrEqual(1)
    expect(iso((await state(reachable.id))?.deletion_warned_at)).toBe(run.toISOString())
    expect(iso((await state(gone.id))?.warning_refused_at)).toBe(run.toISOString())
    expect((await state(gone.id))?.deletion_warned_at).toBeNull()
    // Six days later it is not tried again.
    await cleanInactiveMembers(payload, at(6))
    expect(iso((await state(gone.id))?.warning_refused_at)).toBe(run.toISOString())
    expect((await state(gone.id))?.deletion_warned_at).toBeNull()
    // Seven days later, refused again: the countdown starts without a delivered warning.
    const another = await member({ lastSeen: monthsBefore(at(7), 25) })
    const second = await cleanInactiveMembers(payload, at(7))
    expect(second.unreachable).toBeGreaterThanOrEqual(1)
    expect(iso((await state(another.id))?.deletion_warned_at)).toBe(at(7).toISOString())
    expect(iso((await state(gone.id))?.deletion_warned_at)).toBe(at(7).toISOString())
    await cleanInactiveMembers(payload, at(36))
    expect(await state(gone.id)).not.toBeNull()
    await cleanInactiveMembers(payload, at(37, 60_000))
    expect(await state(gone.id)).toBeNull()
    // Nothing ever reached the address.
    expect(await mailpit!.to(gone.email!)).toEqual([])
  })

  // The next two run long before the others (at(-400)): only their own members are due then.
  const early = at(-400)
  const removeMembers = (ids: number[]) =>
    store.execute(
      sql`delete from members where id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )

  it('mark nobody when the server refuses every warning of a run as nonexistent and accepts none', async () => {
    const lost = [
      await member({
        email: address('lost', 'nowhere.example.org'),
        lastSeen: monthsBefore(early, 25),
      }),
      await member({
        email: address('lost', 'nowhere.example.org'),
        lastSeen: monthsBefore(early, 25),
      }),
    ]
    try {
      const result = await cleanInactiveMembers(payload, early)
      expect(result).toMatchObject({ warned: 0, refusedOnce: 0, unreachable: 0, stopped: 0 })
      for (const { id } of lost) {
        expect(await state(id)).toMatchObject({
          deletion_warned_at: null,
          warning_refused_at: null,
        })
      }
      // A week later, the same: the countdown never starts on refusals alone.
      await cleanInactiveMembers(payload, new Date(early.getTime() + 7 * DAY))
      for (const { id } of lost) {
        expect(await state(id)).toMatchObject({
          deletion_warned_at: null,
          warning_refused_at: null,
        })
      }
    } finally {
      await removeMembers(lost.map(({ id }) => id))
    }
  })

  it('stop the warnings of a run, marking nobody, when the server refuses our sender', async () => {
    const due = [
      await member({ lastSeen: monthsBefore(early, 25) }),
      await member({
        email: address('lost', 'nowhere.example.org'),
        lastSeen: monthsBefore(early, 25),
      }),
    ]
    await mailpit!.refuseAll(550, 'Sender')
    try {
      const result = await cleanInactiveMembers(payload, early)
      expect(result).toMatchObject({ warned: 0, refusedOnce: 0, unreachable: 0, stopped: 1 })
      for (const { id } of due) {
        expect(await state(id)).toMatchObject({
          deletion_warned_at: null,
          warning_refused_at: null,
        })
      }
    } finally {
      await mailpit!.refuseAll(null)
      await removeMembers(due.map(({ id }) => id))
    }
    expect(await mailpit!.to(due[0]!.email!)).toEqual([])
  })
})

describe('inactive members without an email address', () => {
  it('are deleted 24 months and 30 days after their last activity, without a warning', async () => {
    const run = at(0)
    const almost = await member({ email: null, lastSeen: monthsBefore(run, 24, 29) })
    const due = await member({ email: null, lastSeen: monthsBefore(run, 24, 31) })
    const result = await cleanInactiveMembers(payload, run)
    expect(result.deletedWithoutEmail).toBeGreaterThanOrEqual(1)
    expect(await state(due.id)).toBeNull()
    expect(await logged('members', due.id)).toEqual(['delete'])
    expect(await state(almost.id)).toMatchObject({ deletion_warned_at: null })
    await cleanInactiveMembers(payload, at(2))
    expect(await state(almost.id)).toBeNull()
  })
})

describe('purgeMemberAuth', () => {
  it('deletes sessions and email links past their end, and saved items whose job is gone', async () => {
    const now = new Date()
    const someone = await createMember(
      store,
      { email: address('auth'), emailVerifiedBy: 'link' },
      now,
    )
    const ended = await createSession(store, someone.id, new Date(now.getTime() - 31 * DAY))
    const live = await createSession(store, someone.id, now)
    const oldLink = await createEmailToken(
      store,
      { purpose: 'sign-in', email: someone.email!, locale: 'en' },
      new Date(now.getTime() - DAY),
    )
    const newLink = await createEmailToken(
      store,
      { purpose: 'sign-in', email: someone.email!, locale: 'en' },
      now,
    )
    const place = await institution(payload)
    const kept = await job(payload, place.id)
    const lost = await job(payload, place.id)
    await saveJob(store, someone.id, kept.id, now)
    await saveJob(store, someone.id, lost.id, now)
    // A saved item that lost its job some other way than the jobs collection (which deletes them).
    await store.execute(sql`
      update saved_items set job_id = null where member_id = ${someone.id} and job_id = ${lost.id}`)

    const counts = await purgeMemberAuth(payload, now)
    expect(counts.sessions).toBeGreaterThanOrEqual(1)
    expect(counts.emailLinks).toBeGreaterThanOrEqual(1)
    expect(counts.savedItems).toBeGreaterThanOrEqual(1)
    const sessions = await rows<{ expires_at: Date }>(
      payload,
      sql`select expires_at from member_sessions where member_id = ${someone.id}`,
    )
    expect(sessions.map((row) => iso(row.expires_at))).toEqual([live.expiresAt.toISOString()])
    expect(ended.expiresAt.getTime()).toBeLessThan(now.getTime())
    const links = await rows<{ expires_at: Date }>(
      payload,
      sql`select expires_at from email_tokens where email = ${someone.email}`,
    )
    expect(links.map((row) => iso(row.expires_at))).toEqual([newLink.expiresAt.toISOString()])
    expect(oldLink.expiresAt.getTime()).toBeLessThan(now.getTime())
    const saved = await rows<{ job_id: number | null }>(
      payload,
      sql`select job_id from saved_items where member_id = ${someone.id}`,
    )
    expect(saved).toEqual([{ job_id: kept.id }])
    // A second run finds nothing of these.
    await purgeMemberAuth(payload, now)
    expect(
      await rows(payload, sql`select id from member_sessions where member_id = ${someone.id}`),
    ).toHaveLength(1)
  })
})

describe('applyDeletionLog', () => {
  it('deletes a member a restore brought back, and keeps one created after the logged deletion', async () => {
    const now = new Date()
    const gone = await createMember(
      store,
      { email: address('revived'), emailVerifiedBy: 'link' },
      now,
    )
    const createdAt = (
      await rows<{ created_at: Date }>(
        payload,
        sql`select created_at from members where id = ${gone.id}`,
      )
    )[0]!.created_at
    expect(await deleteMember(store, gone.id, { reason: 'request' }, now)).toBe(true)
    expect(await logged('members', gone.id)).toEqual(['delete'])
    // A restore brings the row back, as it was.
    await store.execute(sql`
      insert into members (id, email, email_verified_at, email_verified_by, digest_opt_in,
        last_seen_at, created_at, updated_at)
      values (${gone.id}, ${gone.email}, ${iso(createdAt)}, 'link', false, ${iso(createdAt)},
        ${iso(createdAt)}, ${iso(createdAt)})`)
    await createSession(store, gone.id, now)

    // A member made after a logged deletion, with its ID (a restore sets the sequences back).
    const newer = await createMember(
      store,
      { email: address('newer'), emailVerifiedBy: 'link' },
      now,
    )
    await store.execute(sql`
      insert into deletion_log (target_collection, target_id, action, at)
      values ('members', ${newer.id}, 'delete', ${new Date(now.getTime() - DAY).toISOString()})`)

    const counts = await applyDeletionLog(payload, new Date())
    expect(counts.members).toBeGreaterThanOrEqual(1)
    expect(counts.failed).toBe(0)
    expect(await findMember(store, { id: gone.id })).toBeNull()
    expect(
      await rows(payload, sql`select id from member_sessions where member_id = ${gone.id}`),
    ).toEqual([])
    // Not logged a second time.
    expect(await logged('members', gone.id)).toEqual(['delete'])
    expect(await findMember(store, { id: newer.id })).not.toBeNull()
    // A second run changes nothing.
    expect((await applyDeletionLog(payload, new Date())).members).toBe(0)
  })

  it('deletes a suggestion or report again, and clears a report’s address again, through the log', async () => {
    const now = new Date()
    const later = new Date(now.getTime() + 60_000).toISOString()
    const revived = await suggestion(payload, { email: address('suggester'), consent: true })
    const newer = await suggestion(payload, { email: address('newer'), consent: true })
    const report = async () =>
      (
        await payload.create({
          collection: 'reports',
          data: {
            kind: 'wrong-fact',
            details: 'Fake data (integration test). A fact is wrong.',
            email: address('reporter'),
            locale: 'en',
            status: 'new',
          },
          overrideAccess: true,
          depth: 0,
        })
      ).id
    const deletedReport = await report()
    const clearedReport = await report()
    // As if each was deleted (or its address cleared) and a restore brought it back; the newer
    // suggestion has the ID of one deleted before it was made.
    await store.execute(sql`
      insert into deletion_log (target_collection, target_id, action, at) values
        ('submissions', ${revived.id}, 'delete', ${later}),
        ('submissions', ${newer.id}, 'delete', ${new Date(now.getTime() - DAY).toISOString()}),
        ('reports', ${deletedReport}, 'delete', ${later}),
        ('reports', ${clearedReport}, 'clear-email', ${later})`)

    const counts = await applyDeletionLog(payload, new Date(now.getTime() + 120_000))
    expect(counts).toMatchObject({ suggestions: 1, reports: 1, reportAddresses: 1, failed: 0 })
    expect(await rows(payload, sql`select id from submissions where id = ${revived.id}`)).toEqual(
      [],
    )
    expect(
      await rows(payload, sql`select id from submissions where id = ${newer.id}`),
    ).toHaveLength(1)
    expect(await rows(payload, sql`select id from reports where id = ${deletedReport}`)).toEqual([])
    expect(await rows(payload, sql`select email from reports where id = ${clearedReport}`)).toEqual(
      [{ email: null }],
    )
    // Each logged once, by the log row the test wrote: the repeat is not logged again.
    expect(await logged('submissions', revived.id)).toEqual(['delete'])
    expect(await logged('reports', deletedReport)).toEqual(['delete'])
    expect(await logged('reports', clearedReport)).toEqual(['clear-email'])
  })
})

describe('deleting one’s own account', () => {
  it('records the request closed and deletes the member, with its log row, in one transaction', async () => {
    const now = new Date()
    const leaving = await createMember(
      store,
      { email: address('leaving'), emailVerifiedBy: 'link' },
      now,
    )
    await createSession(store, leaving.id, now)
    expect(await deleteOwnAccount(payload, leaving, now)).toBe(true)
    expect(await findMember(store, { id: leaving.id })).toBeNull()
    expect(await logged('members', leaving.id)).toEqual(['delete'])
    const [record, ...others] = await rows<Record<string, unknown>>(
      payload,
      sql`select kind, source, status, action, email, outcome, received_at, closed_at, purge_at,
        respond_by, confirmation_sent_at, name, details
        from data_requests where email = ${leaving.email}`,
    )
    expect(others).toEqual([])
    expect(record).toMatchObject({
      kind: 'deletion',
      source: 'account',
      status: 'closed',
      action: 'deleted-automatically',
      email: leaving.email,
      outcome: { accountDeleted: 1 },
      confirmation_sent_at: null,
      name: null,
      details: null,
    })
    expect(iso(record!.received_at as Date)).toBe(now.toISOString())
    expect(Math.abs(new Date(record!.closed_at as Date).getTime() - now.getTime())).toBeLessThan(
      5_000,
    )
    expect(record!.purge_at).not.toBeNull()

    // Pressed again (another tab): nothing more is recorded.
    expect(await deleteOwnAccount(payload, leaving, now)).toBe(false)
    expect(
      await rows(payload, sql`select id from data_requests where email = ${leaving.email}`),
    ).toHaveLength(1)
  })

  it('records the request without an address for an account that has none', async () => {
    const now = new Date()
    const orcidOnly = await createMember(store, { orcidId: orcid() }, now)
    const before = await rows<{ n: number }>(
      payload,
      sql`select count(*)::int as n from data_requests where source = 'account' and email is null`,
    )
    expect(await deleteOwnAccount(payload, orcidOnly, now)).toBe(true)
    const after = await rows<{ n: number }>(
      payload,
      sql`select count(*)::int as n from data_requests where source = 'account' and email is null`,
    )
    expect(after[0]!.n).toBe(before[0]!.n + 1)
    expect(await findMember(store, { id: orcidOnly.id })).toBeNull()
  })
})

describe.skipIf(!canStartMailpit)('sendRequestEmails, through Mailpit', () => {
  const sentAt = async (to: string) =>
    (
      await rows<{ confirmation_sent_at: Date | null }>(
        payload,
        sql`select confirmation_sent_at from data_requests where email = ${to}`,
      )
    )[0]?.confirmation_sent_at ?? null

  it('emails the address of a deleted account once, after the server accepted it', async () => {
    const now = new Date()
    const leaving = await createMember(
      store,
      { email: address('deleted'), emailVerifiedBy: 'link' },
      now,
    )
    await deleteOwnAccount(payload, leaving, now)
    // Not accepted (the server asks to try later): nothing is marked, and it waits.
    await mailpit!.refuseAll(451)
    try {
      const refused = await sendRequestEmails(payload, new Date())
      expect(refused.sent).toBe(0)
      expect(refused.failed).toBeGreaterThanOrEqual(1)
    } finally {
      await mailpit!.refuseAll(null)
    }
    expect(await sentAt(leaving.email!)).toBeNull()

    const counts = await sendRequestEmails(payload, new Date())
    expect(counts.sent).toBeGreaterThanOrEqual(1)
    const [mail, ...more] = await mailpit!.to(leaving.email!)
    expect(more).toEqual([])
    expect(mail?.Subject).toBe('Your Gliagora account has been deleted')
    expect(mail?.Text).toContain(
      'As you asked, we have deleted your Gliagora | Neuroscience account',
    )
    expect(mail?.HTML).toBe('')
    expect(await sentAt(leaving.email!)).not.toBeNull()

    // Once only, also against a save that read the record before the email went.
    await sendRequestEmails(payload, new Date())
    expect(await mailpit!.to(leaving.email!)).toHaveLength(1)
    await store.execute(
      sql`update data_requests set confirmation_sent_at = null where email = ${leaving.email}`,
    )
    expect(await sentAt(leaving.email!)).not.toBeNull()
  })

  it('emails only requests received within the last 7 days', async () => {
    const now = new Date()
    const old = await createMember(store, { email: address('old'), emailVerifiedBy: 'link' }, now)
    const recent = await createMember(
      store,
      { email: address('recent'), emailVerifiedBy: 'link' },
      now,
    )
    await deleteOwnAccount(payload, old, new Date(now.getTime() - 8 * DAY))
    await deleteOwnAccount(payload, recent, new Date(now.getTime() - 6 * DAY))
    await sendRequestEmails(payload, now)
    expect(await mailpit!.to(old.email!)).toEqual([])
    expect(await sentAt(old.email!)).toBeNull()
    expect(await mailpit!.to(recent.email!)).toHaveLength(1)
  })

  it('sends nothing for requests editors record and answer themselves', async () => {
    const to = address('emailed')
    await payload.create({
      collection: 'data-requests',
      data: { kind: 'deletion', source: 'email', email: to, locale: 'en', status: 'new' },
      overrideAccess: true,
      depth: 0,
    })
    await sendRequestEmails(payload, new Date())
    expect(await mailpit!.to(to)).toEqual([])
  })
})

describe('the retention of data requests and of the deletion log', () => {
  it('deletes closed requests 2 years after closing, unconfirmed ones after 60 days, and log rows after 7 months', async () => {
    const now = new Date()
    const closed = await payload.create({
      collection: 'data-requests',
      data: {
        kind: 'access',
        source: 'email',
        email: address('closed'),
        locale: 'en',
        status: 'new',
      },
      overrideAccess: true,
      depth: 0,
    })
    const unconfirmed = async (daysAgo: number) =>
      payload.create({
        collection: 'data-requests',
        data: {
          kind: 'deletion',
          source: 'form',
          status: 'unconfirmed',
          locale: 'en',
          receivedAt: new Date(now.getTime() - daysAgo * DAY).toISOString(),
        },
        overrideAccess: true,
        depth: 0,
      })
    const expired = await unconfirmed(61)
    const recent = await unconfirmed(59)
    const open = await payload.create({
      collection: 'data-requests',
      data: {
        kind: 'other',
        source: 'email',
        email: address('open'),
        locale: 'en',
        status: 'new',
      },
      overrideAccess: true,
      depth: 0,
    })
    await store.execute(sql`
      update data_requests set status = 'closed', action = 'answered',
        closed_at = ${new Date(now.getTime() - 800 * DAY).toISOString()},
        purge_at = ${new Date(now.getTime() - DAY).toISOString()}
      where id = ${closed.id}`)
    const logRows = await rows<{ id: number }>(
      payload,
      sql`insert into deletion_log (target_collection, target_id, action, at) values
        ('members', 999999901, 'delete', ${monthsBefore(now, 7, 1).toISOString()}),
        ('members', 999999902, 'delete', ${monthsBefore(now, 7, -1).toISOString()})
        returning id`,
    )

    const requests = await purgeDataRequests(payload, now)
    expect(requests.closed).toBeGreaterThanOrEqual(1)
    expect(requests.unconfirmed).toBeGreaterThanOrEqual(1)
    const left = async (id: number) =>
      (await rows(payload, sql`select id from data_requests where id = ${id}`)).length
    expect(await left(closed.id)).toBe(0)
    expect(await left(expired.id)).toBe(0)
    expect(await left(recent.id)).toBe(1)
    expect(await left(open.id)).toBe(1)

    expect(await purgeDeletionLog(payload, now)).toBeGreaterThanOrEqual(1)
    const remaining = await rows<{ id: number }>(
      payload,
      sql`select id from deletion_log where id in (${logRows[0]!.id}, ${logRows[1]!.id})`,
    )
    expect(remaining.map((row) => row.id)).toEqual([logRows[1]!.id])
  })
})
