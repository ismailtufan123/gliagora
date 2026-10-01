import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmailNotSentError } from './adapter'
import { WAIT_FOR_SEND_MS, deliver, deliverWhileWaiting, enhancedStatus, sendOne } from './deliver'

// What the mail server answered, as `sendOne` reports it (src/lib/email/deliver.ts): the reply code
// and the enhanced status, never the reply's text. The inactivity warnings (M4b) tell an address
// that does not exist (5.1.x) from a full mailbox, a policy refusal and "try again later" (4xx).

const message = { locale: 'en' as const, subject: 'Subject', text: 'Text\n' }

afterEach(() => {
  vi.unstubAllEnvs()
})

const sending = (result: () => Promise<unknown>) =>
  ({ sendEmail: vi.fn(result), logger: { warn: vi.fn() } }) as unknown as Payload & {
    logger: { warn: ReturnType<typeof vi.fn> }
  }

describe('sendOne', () => {
  it('reports the accepting reply', async () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const payload = sending(async () => ({
      accepted: ['x@example.org'],
      rejected: [],
      response: '250 2.0.0 Ok: queued as ABC123',
    }))
    expect(await sendOne(payload, 'x@example.org', message)).toEqual({
      status: 'sent',
      reply: { code: 250, enhanced: '2.0.0' },
    })
  })

  it.each([
    [
      'an address that does not exist',
      new EmailNotSentError('EENVELOPE', 550, '5.1.1'),
      'refused',
      { code: 550, enhanced: '5.1.1' },
    ],
    [
      'a full mailbox',
      new EmailNotSentError('EENVELOPE', 552, '5.2.2'),
      'refused',
      { code: 552, enhanced: '5.2.2' },
    ],
    [
      'a policy refusal without enhanced status',
      new EmailNotSentError('EENVELOPE', 554),
      'refused',
      { code: 554 },
    ],
    [
      '"try again later"',
      new EmailNotSentError('EENVELOPE', 450, '4.2.1'),
      'refused',
      { code: 450, enhanced: '4.2.1' },
    ],
    [
      'a server that cannot be reached',
      new EmailNotSentError('ECONNECTION'),
      'unavailable',
      undefined,
    ],
  ] as const)('tells %s', async (_case, error, status, reply) => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const result = await sendOne(
      sending(async () => Promise.reject(error)),
      'x@example.org',
      message,
    )
    expect(result).toEqual({
      status,
      ...(reply ? { reply } : {}),
      error: expect.stringMatching(/^EmailNotSentError/),
    })
    expect(JSON.stringify(result)).not.toContain('example.org')
  })

  it('reads the codes of a raw Nodemailer error, without its text', async () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const raw = Object.assign(new Error('550 5.1.1 <x@example.org>: no such user'), {
      code: 'EENVELOPE',
      responseCode: 550,
      response: '550 5.1.1 <x@example.org>: Recipient address rejected: User unknown',
    })
    const result = await sendOne(
      sending(async () => Promise.reject(raw)),
      'x@example.org',
      message,
    )
    expect(result).toEqual({
      status: 'refused',
      reply: { code: 550, enhanced: '5.1.1' },
      error: 'Error EENVELOPE 550',
    })
  })

  it('sends nothing without a mail server', async () => {
    vi.stubEnv('SMTP_HOST', '')
    const payload = sending(async () => ({}))
    expect(await sendOne(payload, 'x@example.org', message)).toEqual({ status: 'unavailable' })
    expect(payload.sendEmail).not.toHaveBeenCalled()
  })
})

describe('deliver', () => {
  it('keeps its answers and log lines on top of sendOne', async () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const refused = sending(async () => ({ accepted: [], rejected: ['x@example.org'] }))
    expect(await deliver(refused, 'x@example.org', message, 'task')).toBe('refused')
    expect(refused.logger.warn).toHaveBeenCalledWith(
      'task: the mail server did not accept a message',
    )
    vi.stubEnv('SMTP_HOST', '')
    const off = sending(async () => ({}))
    expect(await deliver(off, 'x@example.org', message, 'task')).toBe('unavailable')
    expect(off.logger.warn).not.toHaveBeenCalled()
  })
})

describe('deliverWhileWaiting', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives up after its time limit, as if the server could not be reached', async () => {
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    vi.useFakeTimers()
    const stuck = sending(() => new Promise(() => {}))
    const sent = deliverWhileWaiting(stuck, 'x@example.org', message, 'Sign-in link', 1000)
    await vi.advanceTimersByTimeAsync(999)
    let settled = false
    void sent.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await sent).toBe('unavailable')
    expect(stuck.logger.warn).toHaveBeenCalledWith('Sign-in link: a message was not sent (Timeout)')
  })

  it('waits 20 seconds by default and answers as deliver does', async () => {
    expect(WAIT_FOR_SEND_MS).toBe(20_000)
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    const taken = sending(async () => ({ accepted: ['x@example.org'], rejected: [] }))
    expect(await deliverWhileWaiting(taken, 'x@example.org', message, 'task')).toBe('sent')
    expect(taken.logger.warn).not.toHaveBeenCalled()
    const refused = sending(async () => ({ accepted: [], rejected: ['x@example.org'] }))
    expect(await deliverWhileWaiting(refused, 'x@example.org', message, 'task')).toBe('refused')
  })
})

describe('enhancedStatus', () => {
  it.each([
    ['550 5.1.1 <x@example.org>: Recipient address rejected', '5.1.1'],
    ['550-5.1.1 The email account that you tried to reach does not exist.', '5.1.1'],
    ['452 4.2.2 Mailbox full', '4.2.2'],
    ['250 2.0.0 Ok', '2.0.0'],
    ['550 Recipient address rejected', undefined],
    ['5.1.1 without a code', undefined],
    ['550 5.1.1x', undefined],
    [undefined, undefined],
  ])('reads %j as %j', (response, expected) => {
    expect(enhancedStatus(response)).toBe(expected)
  })
})
