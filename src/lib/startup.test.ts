import { afterEach, describe, expect, it, vi } from 'vitest'

const getPayload = vi.fn()
vi.mock('payload', () => ({ getPayload }))
vi.mock('@payload-config', () => ({ default: {} }))

const { connectOnStart } = await import('./startup')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  getPayload.mockReset()
})

describe('connectOnStart', () => {
  it('does nothing outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await connectOnStart()
    expect(getPayload).not.toHaveBeenCalled()
  })

  it('connects Payload in production, which applies migrations', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    getPayload.mockResolvedValue({})
    await connectOnStart()
    expect(getPayload).toHaveBeenCalledOnce()
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
