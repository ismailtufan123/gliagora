import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RorImportTask, checkAndImportRor } from './rorImport'

const ZENODO = {
  files: [
    {
      key: 'v2.13-2026-09-22-ror-data.zip',
      size: 1,
      links: {
        self: 'https://zenodo.org/api/records/1/files/v2.13-2026-09-22-ror-data.zip/content',
      },
    },
  ],
}

function fakePayload(status: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = []
  const payload = {
    findGlobal: vi.fn(async () => status),
    updateGlobal: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      updates.push(data)
      return data
    }),
    logger: { info: vi.fn(), warn: vi.fn() },
  }
  return { payload: payload as unknown as Payload, updates }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ROR import job', () => {
  it('only checks Zenodo when the latest release is already imported', async () => {
    const fetchMock = vi.fn(async () => Response.json(ZENODO))
    vi.stubGlobal('fetch', fetchMock)
    const { payload, updates } = fakePayload({ release: 'v2.13', lastError: null })
    expect(await checkAndImportRor(payload)).toEqual({ release: 'v2.13', imported: false })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(updates).toEqual([{ lastCheckedAt: expect.any(String) }])
  })

  it('records a failed check in the admin and fails the job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('forbidden', { status: 403 })),
    )
    const { payload, updates } = fakePayload({ release: 'v2.12' })
    await expect(checkAndImportRor(payload)).rejects.toThrow(/403/)
    expect(updates.at(-1)).toEqual({ lastError: 'Checking Zenodo failed: Zenodo answered 403' })
  })

  it('records a failed download in the admin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/files/') ? new Response('gone', { status: 404 }) : Response.json(ZENODO),
      ),
    )
    const { payload, updates } = fakePayload({ release: 'v2.12' })
    await expect(checkAndImportRor(payload)).rejects.toThrow(/404/)
    expect(updates.at(-1)).toEqual({ lastError: 'Download failed: 404' })
  })

  it('checks every night in its own queue', () => {
    expect(RorImportTask.schedule).toEqual([{ cron: '30 3 * * *', queue: 'ror' }])
  })
})
