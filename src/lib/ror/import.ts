import type { Payload } from 'payload'

import { ROR_IMPORT_CONTEXT } from '@/collections/Institutions'
import { slugify } from '@/lib/slug'

import { fromRorRecord } from './record'

export type ImportCounts = {
  /** Records read from the dump. */
  read: number
  created: number
  updated: number
  /** Unchanged since the last import (same ROR modification date). */
  unchanged: number
  /** Withdrawn in ROR and never imported, so not added. */
  skipped: number
  /** Records without the fields every institution needs. */
  invalid: number
  /** Records the database refused; see the log. */
  failed: number
}

type Existing = { id: number; rorLastModified: string | null }

/**
 * Brings the institutions in line with a ROR dump (PLAN §6.2): new records are created, changed
 * ones updated, unchanged ones left alone. Records are never deleted, because ROR only marks them
 * inactive or withdrawn; a withdrawn record that was never imported is not added.
 */
export async function importRorRecords({
  payload,
  records,
  release,
  onProgress,
}: {
  payload: Payload
  records: AsyncIterable<unknown>
  /** The release the records come from, e.g. `v2.13`. */
  release: string
  onProgress?: (counts: ImportCounts) => void
}): Promise<ImportCounts> {
  const counts: ImportCounts = {
    read: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    invalid: 0,
    failed: 0,
  }

  const existing = new Map<string, Existing>()
  const found = await payload.find({
    collection: 'institutions',
    where: { rorId: { exists: true } },
    select: { rorId: true, rorLastModified: true },
    pagination: false,
    depth: 0,
  })
  for (const doc of found.docs) {
    if (doc.rorId) {
      existing.set(doc.rorId, { id: doc.id, rorLastModified: doc.rorLastModified ?? null })
    }
  }

  const countries = await payload.find({
    collection: 'countries',
    select: {},
    pagination: false,
    depth: 0,
  })
  const knownCountries = new Set(countries.docs.map((country) => country.id))

  for await (const record of records) {
    counts.read++
    if (onProgress && counts.read % 10_000 === 0) onProgress({ ...counts })
    const institution = fromRorRecord(record)
    if (!institution) {
      counts.invalid++
      continue
    }
    const { countryCode, ...rest } = institution
    const previous = existing.get(institution.rorId)
    if (previous?.rorLastModified === institution.rorLastModified) {
      counts.unchanged++
      continue
    }
    if (!previous && institution.status === 'withdrawn') {
      counts.skipped++
      continue
    }
    const data = {
      ...rest,
      slug: slugify(rest.name, { fallback: 'institution' }),
      country: countryCode && knownCountries.has(countryCode) ? countryCode : null,
      origin: 'ror' as const,
      rorRelease: release,
    }
    try {
      if (previous) {
        await payload.update({
          collection: 'institutions',
          id: previous.id,
          data,
          depth: 0,
          context: { [ROR_IMPORT_CONTEXT]: true },
        })
        counts.updated++
      } else {
        const created = await payload.create({
          collection: 'institutions',
          data,
          depth: 0,
          context: { [ROR_IMPORT_CONTEXT]: true },
        })
        existing.set(institution.rorId, {
          id: created.id,
          rorLastModified: institution.rorLastModified,
        })
        counts.created++
      }
    } catch (error) {
      counts.failed++
      if (counts.failed <= 20) {
        payload.logger.warn(
          `ROR import: ${institution.rorId} not saved: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  return counts
}
