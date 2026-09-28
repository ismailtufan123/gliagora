import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { releaseInterruptedJobs } from './release'

function fakePayload(stuck: { taskSlug: string | null }[]) {
  return {
    find: vi.fn(async () => ({ docs: stuck })),
    delete: vi.fn(async () => ({ docs: [] })),
    updateGlobal: vi.fn(async () => ({})),
    logger: { warn: vi.fn() },
  }
}

describe('releaseInterruptedJobs', () => {
  it('removes every job a restart left marked as processing, in every queue', async () => {
    const payload = fakePayload([{ taskSlug: 'expireListings' }, { taskSlug: 'purgeRetention' }])
    await releaseInterruptedJobs(payload as unknown as Payload)
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-jobs',
        where: { processing: { equals: true } },
      }),
    )
    expect(payload.delete).toHaveBeenCalledWith({
      collection: 'payload-jobs',
      where: { processing: { equals: true } },
    })
    expect(payload.logger.warn).toHaveBeenCalledWith(
      'Released 2 scheduled jobs that a restart cut off: expireListings, purgeRetention',
    )
    // Only an interrupted ROR import is shown in the admin.
    expect(payload.updateGlobal).not.toHaveBeenCalled()
  })

  it('says so in the admin when the ROR import was cut off', async () => {
    const payload = fakePayload([{ taskSlug: 'rorImport' }])
    await releaseInterruptedJobs(payload as unknown as Payload)
    expect(payload.updateGlobal).toHaveBeenCalledWith({
      slug: 'ror-import',
      data: { lastError: expect.stringMatching(/restart/) },
    })
  })

  it('does nothing when no job was cut off', async () => {
    const payload = fakePayload([])
    await releaseInterruptedJobs(payload as unknown as Payload)
    expect(payload.delete).not.toHaveBeenCalled()
    expect(payload.updateGlobal).not.toHaveBeenCalled()
    expect(payload.logger.warn).not.toHaveBeenCalled()
  })
})
