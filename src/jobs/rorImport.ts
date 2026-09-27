import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Payload, TaskConfig } from 'payload'

import { downloadRelease, latestRelease, readDump, type RorRelease } from '@/lib/ror/dump'
import { type ImportCounts, importRorRecords } from '@/lib/ror/import'

/** Imports one ROR dump file and records the result in the `ror-import` global. */
export async function importRorDump(
  payload: Payload,
  file: string,
  release: Pick<RorRelease, 'version' | 'date'>,
): Promise<ImportCounts> {
  const started = Date.now()
  try {
    const counts = await importRorRecords({
      payload,
      records: readDump(file),
      release: release.version,
      onProgress: (progress) => payload.logger.info(`ROR import: ${progress.read} records read`),
    })
    await payload.updateGlobal({
      slug: 'ror-import',
      data: {
        release: release.version,
        releaseDate: release.date,
        lastImportedAt: new Date().toISOString(),
        counts,
        lastError: null,
      },
    })
    payload.logger.info(
      `ROR import of ${release.version} finished in ${Math.round((Date.now() - started) / 1000)} s: ${JSON.stringify(counts)}`,
    )
    return counts
  } catch (error) {
    await payload.updateGlobal({
      slug: 'ror-import',
      data: { lastError: error instanceof Error ? error.message : String(error) },
    })
    throw error
  }
}

/**
 * Payload marks a running job as processing and does not recover it if the process stops. The app
 * runs as one process, so at startup no import can still be running: a job still marked as
 * processing was cut off by a restart (a deploy, a reboot, running out of memory). Left in place,
 * it would stop every later scheduled run. It is removed, and the admin shows what happened; the
 * next night's run imports the release again, which only changes what still differs.
 */
export async function releaseInterruptedImports(payload: Payload): Promise<void> {
  const where = { taskSlug: { equals: 'rorImport' }, processing: { equals: true } }
  const { totalDocs } = await payload.count({ collection: 'payload-jobs', where })
  if (totalDocs === 0) return
  await payload.delete({ collection: 'payload-jobs', where })
  await payload.updateGlobal({
    slug: 'ror-import',
    data: { lastError: 'An import was cut off by a restart. The next nightly run continues it.' },
  })
  payload.logger.warn('ROR import: released an import that a restart cut off')
}

/**
 * Checks Zenodo for a new ROR release and imports it (PLAN §6.2). The check is one small request,
 * so it runs every night; ROR publishes about once a month. The import is idempotent: after an
 * interruption the next run picks up where the data differs.
 */
export async function checkAndImportRor(
  payload: Payload,
): Promise<{ release: string; imported: boolean }> {
  const status = await payload.findGlobal({ slug: 'ror-import' })
  await payload.updateGlobal({
    slug: 'ror-import',
    data: { lastCheckedAt: new Date().toISOString() },
  })
  let release: RorRelease
  try {
    release = await latestRelease()
  } catch (error) {
    // Shown in the admin (System → ROR import); the next night's run tries again.
    await payload.updateGlobal({
      slug: 'ror-import',
      data: {
        lastError: `Checking Zenodo failed: ${error instanceof Error ? error.message : error}`,
      },
    })
    throw error
  }
  if (status.release === release.version && !status.lastError) {
    return { release: release.version, imported: false }
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'ror-'))
  try {
    const file = path.join(dir, release.fileName)
    payload.logger.info(`ROR import: downloading ${release.fileName}`)
    try {
      await downloadRelease(release, file)
    } catch (error) {
      await payload.updateGlobal({
        slug: 'ror-import',
        data: { lastError: error instanceof Error ? error.message : String(error) },
      })
      throw error
    }
    await importRorDump(payload, file, release)
    return { release: release.version, imported: true }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export const RorImportTask: TaskConfig = {
  slug: 'rorImport',
  label: 'Import institutions from ROR',
  // Every night at 03:30 UTC (06:30 in Türkiye). Only runs where scheduled jobs are switched on
  // (`PAYLOAD_JOBS_AUTORUN`, see payload.config.ts).
  schedule: [{ cron: '30 3 * * *', queue: 'ror' }],
  retries: 0,
  outputSchema: [
    { name: 'release', type: 'text' },
    { name: 'imported', type: 'checkbox' },
  ],
  handler: async ({ req }) => ({ output: await checkAndImportRor(req.payload) }),
}
