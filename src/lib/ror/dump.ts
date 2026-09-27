import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import yauzl from 'yauzl'

import { USER_AGENT } from '@/lib/http'

import { jsonArrayObjects } from './json-array'

// The ROR data dump is published on Zenodo about once a month under one concept record; this URL
// always redirects to the latest release (PLAN §6.2).
export const ZENODO_LATEST_URL = 'https://zenodo.org/api/records/6347574/versions/latest'

export type RorRelease = {
  /** e.g. `v2.13` */
  version: string
  /** Release date, e.g. `2026-09-22` */
  date: string
  fileName: string
  downloadUrl: string
  size: number
}

const RELEASE_FILE = /^(v\d+(?:\.\d+)*)-(\d{4}-\d{2}-\d{2})-ror-data\.zip$/

type ZenodoRecord = { files?: { key?: unknown; size?: unknown; links?: { self?: unknown } }[] }

/** The release described by a Zenodo record of the ROR data dump. */
export function releaseFromZenodo(record: ZenodoRecord): RorRelease {
  for (const file of record.files ?? []) {
    const match = typeof file.key === 'string' ? RELEASE_FILE.exec(file.key) : null
    if (!match || typeof file.links?.self !== 'string') continue
    return {
      version: match[1] as string,
      date: match[2] as string,
      fileName: file.key as string,
      downloadUrl: file.links.self,
      size: typeof file.size === 'number' ? file.size : 0,
    }
  }
  throw new Error('The Zenodo record has no ROR data file')
}

export async function latestRelease(fetchImpl: typeof fetch = fetch): Promise<RorRelease> {
  const response = await fetchImpl(ZENODO_LATEST_URL, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Zenodo answered ${response.status}`)
  return releaseFromZenodo((await response.json()) as ZenodoRecord)
}

/** Downloads a release to `path` (the zip is about 40 MB). */
export async function downloadRelease(
  release: RorRelease,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(release.downloadUrl, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(600_000),
  })
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`)
  await pipeline(
    Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
    createWriteStream(path),
  )
}

const openZip = (path: string) =>
  new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) =>
      error ? reject(error) : resolve(zip),
    ),
  )

/**
 * The records in the JSON file of a ROR dump zip (`…-ror-data.json`, schema v2), one at a time.
 * The file is streamed, so memory use stays low.
 */
export async function* readDump(path: string): AsyncGenerator<unknown> {
  const zip = await openZip(path)
  try {
    const entries = await new Promise<yauzl.Entry[]>((resolve, reject) => {
      const found: yauzl.Entry[] = []
      zip.on('entry', (next: yauzl.Entry) => {
        found.push(next)
        zip.readEntry()
      })
      zip.on('end', () => resolve(found))
      zip.on('error', reject)
      zip.readEntry()
    })
    // Releases before v2.0 held a schema v1 file next to the v2 one (`…_schema_v2.json`).
    const entry =
      entries.find((e) => e.fileName.endsWith('-ror-data_schema_v2.json')) ??
      entries.find((e) => e.fileName.endsWith('-ror-data.json'))
    if (!entry) throw new Error('The zip file has no ROR data JSON file')
    const stream = await new Promise<Readable>((resolve, reject) =>
      zip.openReadStream(entry, (error, readable) => (error ? reject(error) : resolve(readable))),
    )
    yield* jsonArrayObjects(stream)
  } finally {
    zip.close()
  }
}
