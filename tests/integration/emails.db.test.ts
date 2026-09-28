import { sql } from '@payloadcms/db-postgres'
import type { CollectionBeforeChangeHook, Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { acknowledgeReports } from '@/jobs/maintenance/acknowledgeReports'
import { notifySubmitters } from '@/jobs/maintenance/notifySubmitters'
import { inTransaction } from '@/jobs/maintenance/task'

import {
  DAY,
  HOUR,
  decide,
  institution,
  job,
  publishDraft,
  rows,
  suggestion,
  testPayload,
  unique,
} from './helpers'
import { type Mailpit, dockerAvailable, startMailpit } from './mailpit'

// The automatic emails (M4.7) through a real SMTP server: a Mailpit container on free ports of
// this computer, read back through its API. Skipped where Docker is not available.

const docker = await dockerAvailable()

describe.skipIf(!docker)('automatic emails through Mailpit', () => {
  let mailpit: Mailpit
  let payload: Payload

  beforeAll(async () => {
    mailpit = await startMailpit()
    payload = await testPayload({
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(mailpit.smtpPort),
      SMTP_SECURE: 'false',
      EMAIL_FROM: 'Gliagora <hello@gliagora.com>',
    })
  })

  afterAll(async () => {
    await payload?.destroy()
    await mailpit?.stop()
  })

  const notified = async (id: number) =>
    (
      await rows<{ notified_at: Date | null }>(
        payload,
        sql`SELECT notified_at FROM submissions WHERE id = ${id}`,
      )
    )[0]?.notified_at ?? null

  /** A run an hour on: a "not added" email waits until the decision has stood that long. */
  const later = () => new Date(Date.now() + HOUR)

  /**
   * Holds the next save of document `id` in `collection` between reading the document and writing
   * it, as a slow save by an editor would be; `reached` resolves once it waits there.
   */
  function holdSave(collection: 'reports' | 'submissions', id: number) {
    let entered: () => void = () => {}
    const reached = new Promise<void>((resolve) => (entered = resolve))
    let resume: () => void = () => {}
    const resumed = new Promise<void>((resolve) => (resume = resolve))
    const hooks = payload.collections[collection].config.hooks
    const hold: CollectionBeforeChangeHook = async ({ data, originalDoc }) => {
      if (originalDoc?.id === id) {
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

  it('tells each person who asked the outcome of their suggestion, once', async () => {
    const place = await institution(payload)
    const address = (name: string) => `${unique(name)}@example.org`
    const rejectedTo = address('rejected')
    const rejected = await suggestion(payload, { email: rejectedTo, consent: true, locale: 'tr' })
    await decide(payload, rejected.candidateId, place.id, {
      status: 'rejected',
      reason: 'not-employer-page',
    })
    const publishedTo = address('published')
    const published = await suggestion(payload, { email: publishedTo, consent: true })
    const accepted = await decide(payload, published.candidateId, place.id, { status: 'accepted' })
    const publishedJob = await publishDraft(payload, Number(accepted.publishedRef))
    const waitingTo = address('waiting')
    const waiting = await suggestion(payload, { email: waitingTo, consent: true })
    const waitingCandidate = await decide(payload, waiting.candidateId, place.id, {
      status: 'accepted',
    })
    const spamTo = address('spam')
    const spam = await suggestion(payload, { email: spamTo, consent: true })
    await decide(payload, spam.candidateId, place.id, { status: 'rejected', reason: 'spam' })
    const duplicateTo = address('duplicate')
    const duplicate = await suggestion(payload, { email: duplicateTo, consent: true })
    const existing = await job(payload, place.id)
    await decide(payload, duplicate.candidateId, place.id, {
      status: 'duplicate',
      duplicateOf: existing.id,
    })
    // An address given without ticking the box is never stored, so never written to.
    const noConsent = await suggestion(payload, { email: address('no-consent'), consent: false })
    await decide(payload, noConsent.candidateId, place.id, { status: 'rejected', reason: 'closed' })

    // "Published" goes at once; "not added" waits an hour, so an editor can reopen a mistake.
    const early = await notifySubmitters(payload, new Date())
    expect(early.failed).toBe(0)
    expect(await mailpit.to(publishedTo)).toHaveLength(1)
    expect(await mailpit.to(rejectedTo)).toEqual([])
    expect(await mailpit.to(duplicateTo)).toEqual([])

    const first = await notifySubmitters(payload, later())
    expect(first.failed).toBe(0)
    expect(first.sent).toBeGreaterThanOrEqual(2)

    const [notAdded] = await mailpit.to(rejectedTo)
    expect(notAdded?.Subject).toBe("Gliagora'ya yaptığınız öneri")
    expect(notAdded?.From).toEqual({ Name: 'Gliagora', Address: 'hello@gliagora.com' })
    expect(notAdded?.ReplyTo.map((to) => to.Address)).toEqual(['hello@gliagora.com'])
    expect(notAdded?.Text).toContain(rejected.url)
    expect(notAdded?.Text).toContain('Pozisyonu işverenin kendi web sitesinde bulamadık.')
    expect(notAdded?.Text).toContain('90 gün sonra sileriz')
    expect(notAdded?.HTML).toBe('')
    // Never the note the person wrote.
    expect(notAdded?.Text).not.toContain('mailing list')
    const headers = await mailpit.headers(notAdded?.ID as string)
    expect(headers['Auto-Submitted']).toEqual(['auto-generated'])
    expect(headers['Content-Language']).toEqual(['tr'])

    const [publishedMail] = await mailpit.to(publishedTo)
    expect(publishedMail?.Subject).toBe('Your suggestion is now on Gliagora')
    expect(publishedMail?.Text).toContain(
      `https://gliagora.com/en/jobs/${publishedJob.slug}-${publishedJob.shortId}/`,
    )
    expect(publishedMail?.Text).toContain(published.url)
    const [duplicateMail] = await mailpit.to(duplicateTo)
    expect(duplicateMail?.Text).toContain('We already list this position.')

    expect(await mailpit.to(waitingTo)).toEqual([])
    expect(await mailpit.to(spamTo)).toEqual([])
    for (const id of [rejected.id, published.id, duplicate.id]) {
      expect(await notified(id)).not.toBeNull()
    }
    for (const id of [waiting.id, spam.id, noConsent.id]) expect(await notified(id)).toBeNull()

    // A second run sends nothing more.
    const before = (await mailpit.messages()).length
    expect((await notifySubmitters(payload, later())).sent).toBe(0)
    expect((await mailpit.messages()).length).toBe(before)

    // Once the waiting suggestion's job is published, it gets its email.
    await publishDraft(payload, Number(waitingCandidate.publishedRef))
    expect((await notifySubmitters(payload, later())).sent).toBe(1)
    expect(await mailpit.to(waitingTo)).toHaveLength(1)
    expect(await notified(waiting.id)).not.toBeNull()
  })

  it('sends no "not added" email for a rejection reopened within the hour, and tells the final outcome', async () => {
    const place = await institution(payload)
    const to = `${unique('reopened')}@example.org`
    const suggested = await suggestion(payload, { email: to, consent: true })
    await decide(payload, suggested.candidateId, place.id, { status: 'rejected', reason: 'closed' })
    await notifySubmitters(payload, new Date())
    expect(await mailpit.to(to)).toEqual([])

    // The editor sees the mistake, reopens the candidate and accepts it; the job is published.
    await payload.update({
      collection: 'candidates',
      id: suggested.candidateId,
      data: { status: 'triaged' },
      depth: 0,
    })
    const accepted = await payload.update({
      collection: 'candidates',
      id: suggested.candidateId,
      data: { status: 'accepted' },
      depth: 0,
    })
    await publishDraft(payload, Number(accepted.publishedRef))
    await notifySubmitters(payload, later())
    const mails = await mailpit.to(to)
    expect(mails.map((mail) => mail.Subject)).toEqual(['Your suggestion is now on Gliagora'])
  })

  it('leaves a suggestion that is being saved for the next run', async () => {
    const place = await institution(payload)
    const to = `${unique('locked')}@example.org`
    const pending = await suggestion(payload, { email: to, consent: true })
    await decide(payload, pending.candidateId, place.id, { status: 'rejected', reason: 'closed' })
    let release: () => void = () => {}
    const saving = inTransaction(payload, async (_req, db) => {
      await db.execute(sql`SELECT id FROM submissions WHERE id = ${pending.id} FOR UPDATE`)
      await new Promise<void>((resolve) => (release = resolve))
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    await notifySubmitters(payload, later())
    expect(await mailpit.to(to)).toEqual([])
    release()
    await saving
    await notifySubmitters(payload, later())
    expect(await mailpit.to(to)).toHaveLength(1)
  })

  it('does not send the outcome twice when an editor saves the suggestion while it goes out', async () => {
    const place = await institution(payload)
    const to = `${unique('saved-meanwhile')}@example.org`
    const pending = await suggestion(payload, { email: to, consent: true })
    await decide(payload, pending.candidateId, place.id, { status: 'rejected', reason: 'closed' })
    // The save reads the suggestion (not sent yet), the email goes out and is recorded, then the
    // save writes the whole suggestion as it read it.
    const held = holdSave('submissions', pending.id)
    const save = payload.update({ collection: 'submissions', id: pending.id, data: {}, depth: 0 })
    await held.reached
    expect((await notifySubmitters(payload, later())).sent).toBeGreaterThanOrEqual(1)
    held.release()
    await save
    expect(await notified(pending.id)).not.toBeNull()
    await notifySubmitters(payload, later())
    expect(await mailpit.to(to)).toHaveLength(1)
  })

  it('acknowledges reports with an email address at once, once', async () => {
    const place = await institution(payload)
    const reported = await job(payload, place.id)
    const itemUrl = `/en/jobs/${reported.slug}-${reported.shortId}/`
    const report = (fields: Record<string, unknown>) =>
      payload.create({
        collection: 'reports',
        data: {
          kind: 'wrong-fact',
          details: 'Fake data (integration test). Something about the listing.',
          locale: 'en',
          status: 'new',
          ...fields,
        } as never,
        overrideAccess: true,
        depth: 0,
      })
    const rightsTo = `${unique('rights')}@example.org`
    const rights = await report({
      kind: 'personal-rights',
      email: rightsTo,
      job: reported.id,
      itemUrl,
    })
    const anonymous = await report({})
    const oldTo = `${unique('old')}@example.org`
    const old = await report({ email: oldTo })
    await rows(
      payload,
      sql`UPDATE reports SET created_at = ${new Date(Date.now() - 8 * DAY).toISOString()} WHERE id = ${old.id}`,
    )

    // Reports left by the other test file, with an address and still open, are acknowledged too.
    const first = await acknowledgeReports(payload, new Date())
    expect(first.failed).toBe(0)
    expect(first.sent).toBeGreaterThanOrEqual(1)
    const [ack] = await mailpit.to(rightsTo)
    expect(ack?.Subject).toBe('We have received your request')
    expect(ack?.Text).toContain(`https://gliagora.com${itemUrl}`)
    expect(ack?.Text).toContain('within 24 hours')
    expect(ack?.Text).toContain('within 72 hours')
    expect(ack?.Text).not.toContain('Something about the listing')
    expect(await mailpit.to(oldTo)).toEqual([])
    const sent = await rows<{ id: number; ack_sent_at: Date | null }>(
      payload,
      sql`SELECT id, ack_sent_at FROM reports WHERE id IN (${rights.id}, ${anonymous.id}, ${old.id}) ORDER BY id`,
    )
    expect(sent.map((row) => row.ack_sent_at !== null)).toEqual([true, false, false])

    expect(await acknowledgeReports(payload, new Date())).toEqual({ sent: 0, failed: 0 })
    expect(await mailpit.to(rightsTo)).toHaveLength(1)
  })

  it('names the institution page a report is about (D40)', async () => {
    const place = await institution(payload)
    const itemUrl = `/en/institutions/${place.slug}-${place.shortId}/`
    const to = `${unique('ack-institution')}@example.org`
    await payload.create({
      collection: 'reports',
      data: {
        kind: 'broken-link',
        institution: place.id,
        itemUrl,
        details: 'Fake data (integration test). The website link is broken.',
        email: to,
        locale: 'en',
        status: 'new',
      },
      overrideAccess: true,
      depth: 0,
    })
    expect((await acknowledgeReports(payload, new Date())).sent).toBeGreaterThanOrEqual(1)
    const [ack] = await mailpit.to(to)
    expect(ack?.Subject).toBe('We have received your report')
    expect(ack?.Text).toContain('It is about this page:')
    expect(ack?.Text).toContain(`https://gliagora.com${itemUrl}`)
    // Checked against the institution's website and ROR record: it has no posting.
    expect(ack?.Text).toContain('We check the institution’s details against its own website')
    expect(ack?.Text).not.toContain('original posting')
    expect(ack?.Text).not.toContain('The website link is broken')
  })

  it('does not acknowledge a report twice when an editor saves it while the email goes out', async () => {
    const to = `${unique('ack-saved')}@example.org`
    const report = await payload.create({
      collection: 'reports',
      data: {
        kind: 'wrong-fact',
        details: 'Fake data (integration test). Something about the listing.',
        email: to,
        locale: 'en',
        status: 'new',
      },
      overrideAccess: true,
      depth: 0,
    })
    // The editor's save reads the report, the acknowledgement goes out and is recorded, then the
    // save writes the whole report as it read it.
    const held = holdSave('reports', report.id)
    const save = payload.update({
      collection: 'reports',
      id: report.id,
      data: { status: 'in-progress' },
      depth: 0,
    })
    await held.reached
    expect((await acknowledgeReports(payload, new Date())).sent).toBeGreaterThanOrEqual(1)
    held.release()
    expect((await save).status).toBe('in-progress')
    const [row] = await rows<{ ack_sent_at: Date | null }>(
      payload,
      sql`SELECT ack_sent_at FROM reports WHERE id = ${report.id}`,
    )
    expect(row?.ack_sent_at).not.toBeNull()
    expect((await acknowledgeReports(payload, new Date())).sent).toBe(0)
    expect(await mailpit.to(to)).toHaveLength(1)
  })

  it('keeps a suggestion waiting when the mail server cannot be reached, and tries again later', async () => {
    const place = await institution(payload)
    const to = `${unique('unreachable')}@example.org`
    const pending = await suggestion(payload, { email: to, consent: true })
    await decide(payload, pending.candidateId, place.id, { status: 'rejected', reason: 'closed' })
    await mailpit.stop()

    const run = await notifySubmitters(payload, later())
    expect(run.sent).toBe(0)
    expect(run.failed).toBe(1)
    expect(await notified(pending.id)).toBeNull()
  })
})
