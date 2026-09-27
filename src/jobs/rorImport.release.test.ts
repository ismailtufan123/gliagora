import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { releaseInterruptedImports } from './rorImport'

function fakePayload(stuck: number) {
  return {
    count: vi.fn(async () => ({ totalDocs: stuck })),
    delete: vi.fn(async () => ({ docs: [] })),
    updateGlobal: vi.fn(async () => ({})),
    logger: { warn: vi.fn() },
  }
}

describe('releaseInterruptedImports', () => {
  it('removes an import job that a restart left marked as processing, and says so in the admin', async () => {
    const payload = fakePayload(1)
    await releaseInterruptedImports(payload as unknown as Payload)
    expect(payload.delete).toHaveBeenCalledWith({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'rorImport' }, processing: { equals: true } },
    })
    expect(payload.updateGlobal).toHaveBeenCalledWith({
      slug: 'ror-import',
      data: { lastError: expect.stringMatching(/restart/) },
    })
  })

  it('does nothing when no import was cut off', async () => {
    const payload = fakePayload(0)
    await releaseInterruptedImports(payload as unknown as Payload)
    expect(payload.delete).not.toHaveBeenCalled()
    expect(payload.updateGlobal).not.toHaveBeenCalled()
  })
})
