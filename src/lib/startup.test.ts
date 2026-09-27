import { afterEach, describe, expect, it, vi } from 'vitest'

const getPayload = vi.fn()
const releaseInterruptedImports = vi.fn()
vi.mock('payload', () => ({ getPayload }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/jobs/rorImport', () => ({ releaseInterruptedImports }))

const { connectOnStart } = await import('./startup')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  getPayload.mockReset()
  releaseInterruptedImports.mockReset()
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
    // An import cut off by a restart would otherwise block every later scheduled run.
    expect(releaseInterruptedImports).toHaveBeenCalledWith(payload)
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
