import { beforeEach, describe, expect, it, vi } from 'vitest'

// The home page's data is read at most once every 10 minutes (PLAN §3.2 "Home"); requests that
// come while it is read share that read, and a failed read is not kept.

const reads = vi.hoisted(() => ({ count: 0, fail: false }))

vi.mock('@/lib/records', () => ({
  openJobsCoverage: async () => {
    reads.count++
    if (reads.fail) throw new Error('database unavailable')
    return { open: 45, institutions: 16, countries: [] }
  },
  countOpenJobs: async () => 2,
  latestOpenJobs: async () => [],
  nextDeadlines: async () => [],
  openJobsByType: async () => [],
}))

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12, minutes))

describe('homeData', () => {
  beforeEach(() => {
    vi.resetModules()
    reads.count = 0
    reads.fail = false
  })

  it('reads once, keeps the answer for 10 minutes, then reads again', async () => {
    const { homeData } = await import('./home')
    expect((await homeData(at(0))).open).toBe(45)
    await homeData(at(9))
    expect(reads.count).toBe(1)
    await homeData(at(10))
    expect(reads.count).toBe(2)
  })

  it('shares one read between requests that come while it runs', async () => {
    const { homeData } = await import('./home')
    await Promise.all([homeData(at(0)), homeData(at(0)), homeData(at(0))])
    expect(reads.count).toBe(1)
  })

  it('does not keep a failed read', async () => {
    const { homeData } = await import('./home')
    reads.fail = true
    await expect(homeData(at(0))).rejects.toThrow()
    reads.fail = false
    expect((await homeData(at(1))).deadlinesThisMonth).toBe(2)
    expect(reads.count).toBe(2)
  })
})
