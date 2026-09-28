import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmailNotSentError } from '@/lib/email/adapter'
import { deadlineEnd } from '@/lib/jobs/deadline'
import { TIME_ZONES } from '@/lib/jobs/time-zones'

import { acknowledgeReports } from './acknowledgeReports'
import { accepted, deliver } from './email'
import { ExpireListingsTask } from './expireListings'
import { type NotifyRow, notifySubmitters, suggestionOutcome } from './notifySubmitters'
import { type PlaceRow, placeIsStale } from './syncJobPlaces'

const NOW = new Date('2026-10-15T10:00:00.000Z')
const DAY = 86_400_000

afterEach(() => {
  vi.unstubAllEnvs()
})

const row = (fields: Partial<NotifyRow>): NotifyRow => ({
  id: 1,
  email: 'suggester@example.org',
  url: 'https://www.example.org/jobs/1',
  locale: 'en',
  candidate_status: 'accepted',
  decision_reason: null,
  job_slug: 'phd-in-glia',
  job_short_id: 'k3f9a',
  job_status: 'published',
  job_published_at: new Date(NOW.getTime() - DAY),
  job_deadline_kind: 'fixed',
  job_deadline_at: new Date(NOW.getTime() + 20 * DAY),
  job_expired_at: null,
  job_withdrawn_at: null,
  ...fields,
})

describe('suggestionOutcome', () => {
  it('tells "published" with the job address once the accepted candidate\'s job is public', () => {
    expect(suggestionOutcome(row({}), NOW)).toEqual({
      kind: 'published',
      jobPath: '/en/jobs/phd-in-glia-k3f9a/',
    })
    // Closed but still shown with the closed notice.
    const closed = row({
      job_status: 'expired',
      job_deadline_at: new Date(NOW.getTime() - 2 * DAY),
      job_expired_at: new Date(NOW.getTime() - 2 * DAY),
    })
    expect(suggestionOutcome(closed, NOW)?.kind).toBe('published')
  })

  it('waits while the job is a draft or in review, and never links to a page that answers 410', () => {
    expect(suggestionOutcome(row({ job_published_at: null, job_status: 'draft' }), NOW)).toBeNull()
    expect(
      suggestionOutcome(row({ job_published_at: null, job_status: 'in_review' }), NOW),
    ).toBeNull()
    const withdrawn = row({ job_status: 'withdrawn', job_withdrawn_at: NOW })
    expect(suggestionOutcome(withdrawn, NOW)).toBeNull()
    // The job was retired or deleted: nothing to link to.
    expect(
      suggestionOutcome(row({ job_slug: null, job_short_id: null, job_status: null }), NOW),
    ).toBeNull()
  })

  it('tells "not added" with the reason for a rejected or duplicate candidate', () => {
    expect(
      suggestionOutcome(row({ candidate_status: 'rejected', decision_reason: 'closed' }), NOW),
    ).toEqual({ kind: 'not-added', reason: 'closed' })
    expect(suggestionOutcome(row({ candidate_status: 'duplicate' }), NOW)).toEqual({
      kind: 'not-added',
      reason: 'duplicate',
    })
    // A reason the email does not know reads as "other", never as the editor's note.
    expect(
      suggestionOutcome(row({ candidate_status: 'rejected', decision_reason: null }), NOW),
    ).toEqual({ kind: 'not-added', reason: 'other' })
  })

  it("sends nothing for spam: the address may not be the sender's", () => {
    expect(
      suggestionOutcome(row({ candidate_status: 'rejected', decision_reason: 'spam' }), NOW),
    ).toBeNull()
  })

  it('sends nothing while the candidate is not decided', () => {
    expect(suggestionOutcome(row({ candidate_status: 'triaged' }), NOW)).toBeNull()
  })
})

describe('the transport guard', () => {
  const unusedPayload = () => {
    const payload = {
      db: { drizzle: { execute: vi.fn() } },
      sendEmail: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn() },
    }
    return payload
  }

  it('reads and sends nothing without SMTP_HOST', async () => {
    vi.stubEnv('SMTP_HOST', '')
    const payload = unusedPayload()
    expect(await notifySubmitters(payload as unknown as Payload, NOW)).toEqual({
      sent: 0,
      waiting: 0,
      failed: 0,
    })
    expect(await acknowledgeReports(payload as unknown as Payload, NOW)).toEqual({
      sent: 0,
      failed: 0,
    })
    expect(payload.db.drizzle.execute).not.toHaveBeenCalled()
    expect(payload.sendEmail).not.toHaveBeenCalled()
    expect(
      await deliver(
        payload as unknown as Payload,
        'x@example.org',
        { locale: 'en', subject: 's', text: 't' },
        'test',
      ),
    ).toBe('unavailable')
    expect(payload.sendEmail).not.toHaveBeenCalled()
  })
})

describe('deliver', () => {
  const message = { locale: 'tr' as const, subject: 'Konu', text: 'Metin\n' }

  it('sends plain text that replies to hello@ and is marked as automatic', async () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const sendEmail = vi.fn(async () => ({ accepted: ['x@example.org'], rejected: [] }))
    const payload = { sendEmail, logger: { warn: vi.fn() } } as unknown as Payload
    expect(await deliver(payload, 'x@example.org', message, 'test')).toBe('sent')
    expect(sendEmail).toHaveBeenCalledWith({
      to: 'x@example.org',
      replyTo: 'hello@gliagora.com',
      subject: 'Konu',
      text: 'Metin\n',
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        'Content-Language': 'tr',
      },
    })
  })

  it('tells a refused message from an unreachable server, and never logs the address', async () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const warn = vi.fn()
    const fail = (error: Error) =>
      deliver(
        {
          sendEmail: vi.fn(async () => Promise.reject(error)),
          logger: { warn },
        } as unknown as Payload,
        'x@example.org',
        message,
        'test',
      )
    const refused = Object.assign(new Error('550 <x@example.org> no such user'), {
      code: 'EENVELOPE',
      responseCode: 550,
    })
    expect(await fail(refused)).toBe('refused')
    expect(await fail(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ESOCKET' }))).toBe(
      'unavailable',
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain('x@example.org')
    expect(warn).toHaveBeenCalledWith('test: a message was not sent (Error EENVELOPE 550)')
  })

  it('reads the codes of the errors the email adapter throws (no recipient in them)', async () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const warn = vi.fn()
    const fail = (error: Error) =>
      deliver(
        {
          sendEmail: vi.fn(async () => Promise.reject(error)),
          logger: { warn },
        } as unknown as Payload,
        'x@example.org',
        message,
        'test',
      )
    expect(await fail(new EmailNotSentError('EENVELOPE', 550))).toBe('refused')
    expect(await fail(new EmailNotSentError('ECONNECTION'))).toBe('unavailable')
    expect(warn).toHaveBeenCalledWith(
      'test: a message was not sent (EmailNotSentError EENVELOPE 550)',
    )
  })

  it('counts a message as sent only when its recipient was accepted', () => {
    expect(accepted({ accepted: ['x@example.org'], rejected: [] })).toBe(true)
    expect(accepted({ accepted: [], rejected: ['x@example.org'] })).toBe(false)
    expect(accepted({ accepted: ['x@example.org'], rejected: ['y@example.org'] })).toBe(false)
    expect(accepted(undefined)).toBe(false)
  })
})

describe('placeIsStale', () => {
  const place = (fields: Partial<PlaceRow>): PlaceRow => ({
    id: 1,
    country_id: 'DE',
    city: 'Berlin',
    override_city: null,
    override_country_id: null,
    institution_country_id: 'DE',
    institution_city: 'Berlin',
    ...fields,
  })

  it('finds jobs whose institution moved since they were saved', () => {
    expect(placeIsStale(place({}))).toBe(false)
    expect(placeIsStale(place({ institution_city: 'Potsdam' }))).toBe(true)
    expect(placeIsStale(place({ institution_country_id: 'AT', institution_city: 'Wien' }))).toBe(
      true,
    )
  })

  it('leaves jobs with a location of their own, and follows a partial one like the collection', () => {
    expect(
      placeIsStale(
        place({
          override_city: 'Heidelberg',
          override_country_id: 'DE',
          city: 'Heidelberg',
          institution_city: 'Potsdam',
        }),
      ),
    ).toBe(false)
    // A city of its own in the institution's country: the country follows the institution.
    expect(
      placeIsStale(
        place({ override_city: 'Heidelberg', city: 'Heidelberg', institution_country_id: 'AT' }),
      ),
    ).toBe(true)
  })
})

describe('the hourly expiry', () => {
  it('marks a job at most 50 minutes after its deadline day ends, in every time zone (§2.5: within an hour)', () => {
    const cron = ExpireListingsTask.schedule?.[0]?.cron ?? ''
    expect(cron).toBe('5 * * * *')
    const runMinute = Number(cron.split(' ')[0])
    let latest = 0
    // A winter and a summer day, for daylight-saving time on either side of the equator.
    for (const day of ['2026-01-15', '2026-07-15']) {
      for (const zone of [...TIME_ZONES, null]) {
        const end = deadlineEnd(day, zone)
        expect(end.getUTCSeconds() * 1000 + end.getUTCMilliseconds()).toBe(0)
        latest = Math.max(latest, (runMinute - end.getUTCMinutes() + 60) % 60)
      }
    }
    expect(latest).toBeLessThanOrEqual(50)
    // The latest: a day in Kathmandu (UTC+05:45) ends at :15 UTC and is marked at the next :05.
    expect(deadlineEnd('2026-01-15', 'Asia/Kathmandu').toISOString()).toBe(
      '2026-01-15T18:15:00.000Z',
    )
  })
})
