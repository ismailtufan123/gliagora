import { beforeEach, describe, expect, it, vi } from 'vitest'

// The home page's figures are read at most once every 10 minutes and again when the month
// changes (PLAN §3.2 "Home"); requests that come while they are read share that read, and a
// failed read is not kept. The two short lists are read with every request.

const reads = vi.hoisted(() => ({ figures: 0, lists: 0, fail: false }))

vi.mock('@/lib/records', () => ({
  openJobsCoverage: async () => {
    reads.figures++
    if (reads.fail) throw new Error('database unavailable')
    return { open: 45, institutions: 16, countries: [] }
  },
  countOpenJobs: async () => 2,
  openJobsByType: async () => [],
  latestOpenJobs: async () => {
    reads.lists++
    return []
  },
  nextDeadlines: async () => [],
}))

const at = (day: number, hour: number, minute: number) =>
  new Date(Date.UTC(2026, 9, day, hour, minute))

describe('homeData', () => {
  beforeEach(() => {
    vi.resetModules()
    reads.figures = 0
    reads.lists = 0
    reads.fail = false
  })

  it('keeps the figures for 10 minutes and reads the lists with every request', async () => {
    const { homeData } = await import('./home')
    expect((await homeData(at(1, 12, 0))).open).toBe(45)
    await homeData(at(1, 12, 9))
    expect(reads.figures).toBe(1)
    expect(reads.lists).toBe(2)
    await homeData(at(1, 12, 10))
    expect(reads.figures).toBe(2)
  })

  it('reads the figures again when the month changes', async () => {
    const { homeData } = await import('./home')
    await homeData(at(31, 23, 55))
    await homeData(new Date(Date.UTC(2026, 10, 1, 0, 1)))
    expect(reads.figures).toBe(2)
  })

  it('shares one read between requests that come while it runs', async () => {
    const { homeData } = await import('./home')
    await Promise.all([homeData(at(1, 12, 0)), homeData(at(1, 12, 0)), homeData(at(1, 12, 0))])
    expect(reads.figures).toBe(1)
  })

  it('does not keep a failed read', async () => {
    const { homeData } = await import('./home')
    reads.fail = true
    await expect(homeData(at(1, 12, 0))).rejects.toThrow()
    reads.fail = false
    expect((await homeData(at(1, 12, 1))).deadlinesThisMonth).toBe(2)
    expect(reads.figures).toBe(2)
  })
})
