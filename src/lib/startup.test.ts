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
    getPayload.mockResolvedValue({})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await connectOnStart()
    expect(log).toHaveBeenCalledWith('Email cap of the forms: 50 an hour, 200 a day (default)')
    expect(error).not.toHaveBeenCalled()

    vi.stubEnv('EMAIL_CAP_HOUR', '120')
    vi.stubEnv('EMAIL_CAP_DAY', 'lots')
    await connectOnStart()
    expect(log).toHaveBeenLastCalledWith('Email cap of the forms: 120 an hour, 200 a day')
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^EMAIL_CAP_DAY is not a whole number/),
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain('lots')
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
