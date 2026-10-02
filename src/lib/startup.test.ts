import { afterEach, describe, expect, it, vi } from 'vitest'

const getPayload = vi.fn()
const releaseInterruptedJobs = vi.fn()
vi.mock('payload', () => ({ getPayload }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/jobs/release', () => ({ releaseInterruptedJobs }))

const { connectOnStart } = await import('./startup')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  getPayload.mockReset()
  releaseInterruptedJobs.mockReset()
})

describe('connectOnStart', () => {
  it('does nothing outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await connectOnStart()
    expect(getPayload).not.toHaveBeenCalled()
  })

  it('connects Payload in production, which applies migrations, and starts the scheduled jobs', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const payload = {}
    getPayload.mockResolvedValue(payload)
    await connectOnStart()
    expect(getPayload).toHaveBeenCalledWith({ config: {} })
    // Payload starts its job crons only when asked with cron: true.
    expect(getPayload).toHaveBeenLastCalledWith({ config: {}, cron: true })
    // A job cut off by a restart would otherwise block every later scheduled run of its task.
    expect(releaseInterruptedJobs).toHaveBeenCalledWith(payload)
  })

  it('starts without ALTCHA_HMAC_KEY, warning that the suggestion form is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALTCHA_HMAC_KEY', '')
    getPayload.mockResolvedValue({})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await connectOnStart()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ALTCHA_HMAC_KEY'))
    expect(getPayload).toHaveBeenLastCalledWith({ config: {}, cron: true })

    warn.mockClear()
    vi.stubEnv('ALTCHA_HMAC_KEY', 'a'.repeat(64))
    await connectOnStart()
    expect(warn).not.toHaveBeenCalled()
  })

  it('says which cap on the forms’ emails it uses, and names a setting it cannot use', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('EMAIL_CAP_HOUR', '')
    vi.stubEnv('EMAIL_CAP_DAY', '')
    // The other start lines' settings, unset, so that only the cap can log an error here.
    for (const name of ['SITE_STAGE', 'LISTMONK_URL', 'LISTMONK_API_TOKEN']) vi.stubEnv(name, '')
    getPayload.mockResolvedValue({})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await connectOnStart()
    expect(log).toHaveBeenCalledWith('Email cap of the forms: 50 an hour, 200 a day (default)')
    expect(error).not.toHaveBeenCalled()

    vi.stubEnv('EMAIL_CAP_HOUR', '120')
    vi.stubEnv('EMAIL_CAP_DAY', 'lots')
    await connectOnStart()
    // An unusable day: the stricter of its default and the hour, never more than was set.
    expect(log).toHaveBeenCalledWith('Email cap of the forms: 120 an hour, 120 a day')
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^EMAIL_CAP_DAY is not a whole number/),
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain('lots')
  })

  it('names the site’s stage, and a SITE_STAGE that is not one by its name only', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    getPayload.mockResolvedValue({})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The other start lines' settings, unset, so that only SITE_STAGE can log an error here.
    for (const name of ['EMAIL_CAP_HOUR', 'EMAIL_CAP_DAY', 'LISTMONK_URL', 'LISTMONK_API_TOKEN']) {
      vi.stubEnv(name, '')
    }
    vi.stubEnv('SITE_STAGE', '')
    await connectOnStart()
    expect(log).toHaveBeenCalledWith('Site stage: private')
    expect(error).not.toHaveBeenCalled()

    log.mockClear()
    vi.stubEnv('SITE_STAGE', 'm2')
    await connectOnStart()
    expect(log).toHaveBeenCalledWith('Site stage: m2')

    vi.stubEnv('SITE_STAGE', 'public-now')
    await connectOnStart()
    expect(log).toHaveBeenCalledWith('Site stage: private')
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/^SITE_STAGE is not one of/))
    expect(error.mock.calls.flat().join(' ')).not.toContain('public-now')
  })

  it('says whether the Glia Notes signup is on, and names a setting it cannot use', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    for (const name of ['LISTMONK_URL', 'LISTMONK_API_TOKEN', 'LISTMONK_API_USER', 'SMTP_HOST']) {
      vi.stubEnv(name, '')
    }
    // The other start lines' settings, unset, so that only listmonk's can log an error here.
    for (const name of ['EMAIL_CAP_HOUR', 'EMAIL_CAP_DAY', 'SITE_STAGE']) vi.stubEnv(name, '')
    vi.stubEnv('ALTCHA_HMAC_KEY', 'a'.repeat(64))
    getPayload.mockResolvedValue({})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await connectOnStart()
    expect(log).toHaveBeenCalledWith(
      'Glia Notes: signup off (no listmonk settings), unsubscribe off',
    )
    expect(error).not.toHaveBeenCalled()

    const token = 'b'.repeat(64)
    vi.stubEnv('LISTMONK_URL', 'http://listmonk:9000')
    vi.stubEnv('LISTMONK_API_TOKEN', token)
    await connectOnStart()
    expect(log).toHaveBeenCalledWith('Glia Notes: signup off (no mail server), unsubscribe on')
    vi.stubEnv('SMTP_HOST', '127.0.0.1')
    await connectOnStart()
    expect(log).toHaveBeenCalledWith('Glia Notes: signup on, unsubscribe on')

    vi.stubEnv('LISTMONK_URL', 'listmonk:9000')
    await connectOnStart()
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/LISTMONK_URL is not an http/))
    expect(JSON.stringify([log.mock.calls, error.mock.calls])).not.toContain(token)
  })

  it('exits so Docker restarts the app when the database is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    getPayload.mockRejectedValue(new Error('cannot connect to Postgres'))
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await connectOnStart()
    expect(exit).toHaveBeenCalledWith(1)
  })
})
