import { describe, expect, it, vi } from 'vitest'

import { latestRelease, readDump, releaseFromZenodo } from './dump'

const FIXTURE = new URL(
  '../../../tests/fixtures/ror/v2.13-2026-09-22-ror-data-sample.zip',
  import.meta.url,
).pathname

// The shape of https://zenodo.org/api/records/6347574/versions/latest (trimmed).
const ZENODO = {
  id: 22902037,
  files: [
    {
      key: 'v2.13-2026-09-22-ror-data.zip',
      size: 37540961,
      links: {
        self: 'https://zenodo.org/api/records/22902037/files/v2.13-2026-09-22-ror-data.zip/content',
      },
    },
  ],
}

describe('ROR dump', () => {
  it('reads the release from the Zenodo record', () => {
    expect(releaseFromZenodo(ZENODO)).toEqual({
      version: 'v2.13',
      date: '2026-09-22',
      fileName: 'v2.13-2026-09-22-ror-data.zip',
      downloadUrl:
        'https://zenodo.org/api/records/22902037/files/v2.13-2026-09-22-ror-data.zip/content',
      size: 37540961,
    })
  })

  it('refuses a Zenodo record without a ROR data file', () => {
    expect(() =>
      releaseFromZenodo({ files: [{ key: 'readme.txt', links: { self: 'x' } }] }),
    ).toThrow()
  })

  it('asks Zenodo for the latest release', async () => {
    const fetchImpl = vi.fn(async () => Response.json(ZENODO))
    const release = await latestRelease(fetchImpl as unknown as typeof fetch)
    expect(release.version).toBe('v2.13')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://zenodo.org/api/records/6347574/versions/latest',
      // Zenodo refuses requests without a user agent that names the client.
      expect.objectContaining({
        headers: expect.objectContaining({ 'user-agent': expect.stringContaining('Gliagora') }),
      }),
    )
  })

  it('reports an error answer from Zenodo', async () => {
    const fetchImpl = async () => new Response('busy', { status: 503 })
    await expect(latestRelease(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/503/)
  })

  it('streams the records of the JSON file in the zip', async () => {
    const ids: string[] = []
    for await (const record of readDump(FIXTURE)) ids.push((record as { id: string }).id)
    expect(ids).toHaveLength(21)
    expect(ids[0]).toBe('https://ror.org/05dxps055')
  })
})
