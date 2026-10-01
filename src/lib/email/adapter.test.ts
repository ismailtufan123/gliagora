import type { EmailAdapter, Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

const nodemailerAdapter = vi.fn(async (args: unknown) => args)
vi.mock('@payloadcms/email-nodemailer', () => ({ nodemailerAdapter }))

const { EmailNotSentError, emailAdapter, withoutRecipients } = await import('./adapter')
const { errorSummary } = await import('@/lib/errors')

afterEach(() => {
  nodemailerAdapter.mockClear()
})

describe('emailAdapter', () => {
  it('sends nothing without SMTP_HOST, and logs neither the recipient nor the subject', async () => {
    const adapter = emailAdapter({})
    expect(nodemailerAdapter).not.toHaveBeenCalled()
    const logger = { warn: vi.fn(), info: vi.fn() }
    const email = (adapter as EmailAdapter)({
      payload: { logger } as unknown as Payload,
    })
    expect(email).toMatchObject({
      name: 'none',
      defaultFromAddress: 'hello@gliagora.com',
      defaultFromName: 'Gliagora',
    })
    // What Payload sends itself, for example a new admin password.
    await email.sendEmail({
      to: 'editor@example.org',
      subject: 'Reset your password',
      html: 'token',
    })
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain('editor@example.org')
    expect(logged).not.toContain('Reset your password')
    expect(logged).toContain('SMTP_HOST')
  })

  it('sends through the SMTP server named in SMTP_HOST, never through a test account', async () => {
    await emailAdapter({
      SMTP_HOST: 'smtp.example.org',
      SMTP_PORT: '587',
      SMTP_USER: 'relay-user',
      SMTP_PASS: 'relay-password',
      EMAIL_FROM: 'Gliagora <hello@gliagora.com>',
    })
    expect(nodemailerAdapter).toHaveBeenCalledWith({
      defaultFromAddress: 'hello@gliagora.com',
      defaultFromName: 'Gliagora',
      skipVerify: true,
      transportOptions: expect.objectContaining({
        host: 'smtp.example.org',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'relay-user', pass: 'relay-password' },
        logger: false,
        debug: false,
      }),
    })
  })

  it('gives Payload an adapter whose send errors name no recipient', async () => {
    nodemailerAdapter.mockImplementationOnce(async () => () => ({
      name: 'nodemailer',
      defaultFromAddress: 'hello@gliagora.com',
      defaultFromName: 'Gliagora',
      sendEmail: async () => {
        throw refused()
      },
    }))
    const adapter = (await emailAdapter({ SMTP_HOST: '127.0.0.1' }))({ payload: {} as Payload })
    await expect(adapter.sendEmail({ to: 'x@example.org' })).rejects.toBeInstanceOf(
      EmailNotSentError,
    )
  })

  it('signs in only when SMTP_USER is set (Mailpit needs no account)', async () => {
    await emailAdapter({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' })
    const [args] = nodemailerAdapter.mock.calls[0] as [{ transportOptions: object }]
    expect(args.transportOptions).not.toHaveProperty('auth')
    expect(args.transportOptions).toMatchObject({ host: '127.0.0.1', port: 1025 })
  })
})

// What Nodemailer throws when the server refuses the recipient.
const refused = () =>
  Object.assign(new Error("Can't send mail - all recipients were rejected: 550 <x@example.org>"), {
    code: 'EENVELOPE',
    responseCode: 550,
    response: '550 5.1.1 <x@example.org>: Recipient address rejected',
    rejected: ['x@example.org'],
    rejectedErrors: [{ recipient: 'x@example.org', response: '550 <x@example.org>' }],
  })

describe('withoutRecipients', () => {
  const failing = (error: unknown) =>
    withoutRecipients(() => ({
      name: 'nodemailer',
      defaultFromAddress: 'hello@gliagora.com',
      defaultFromName: 'Gliagora',
      sendEmail: async () => {
        throw error
      },
    }))({ payload: {} as Payload })

  it('throws an error with the codes only, never the recipient or the server reply', async () => {
    const thrown = await failing(refused())
      .sendEmail({ to: 'x@example.org', subject: 'Reset your password' })
      .catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(EmailNotSentError)
    const error = thrown as InstanceType<typeof EmailNotSentError>
    expect(error.code).toBe('EENVELOPE')
    expect(error.responseCode).toBe(550)
    expect(error.cause).toBeUndefined()
    for (const text of [JSON.stringify(error), error.message, String(error.stack)]) {
      expect(text).not.toContain('@')
    }
    // What the tasks log, and how they tell a refused recipient from an unreachable server.
    expect(errorSummary(error)).toBe('EmailNotSentError EENVELOPE 550')
  })

  it('keeps the enhanced status of the reply (5.1.1: no such address), never its text', async () => {
    const thrown = (await failing(refused())
      .sendEmail({ to: 'x@example.org' })
      .catch((error: unknown) => error)) as InstanceType<typeof EmailNotSentError>
    expect(thrown.enhanced).toBe('5.1.1')
    expect(JSON.stringify(thrown)).not.toContain('Recipient')
  })

  it('keeps the code of a transport error, so a task still stops and tries again later', async () => {
    const thrown = await failing(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ESOCKET' }),
    )
      .sendEmail({ to: 'x@example.org' })
      .catch((error: unknown) => error)
    expect(thrown).toMatchObject({ code: 'ESOCKET', responseCode: undefined })
  })

  it('passes on what the server answered when it accepted the message', async () => {
    const adapter = withoutRecipients(() => ({
      name: 'nodemailer',
      defaultFromAddress: 'hello@gliagora.com',
      defaultFromName: 'Gliagora',
      sendEmail: async () => ({ accepted: ['x@example.org'], rejected: [] }),
    }))({ payload: {} as Payload })
    expect(await adapter.sendEmail({ to: 'x@example.org' })).toEqual({
      accepted: ['x@example.org'],
      rejected: [],
    })
    expect(adapter.name).toBe('nodemailer')
  })
})
