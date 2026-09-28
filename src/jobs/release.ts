import type { Payload } from 'payload'

/**
 * Payload marks a running job as processing and does not recover it if the process stops. The app
 * runs as one process, so at startup no scheduled job can still be running: a job still marked as
 * processing, in any queue, was cut off by a restart (a deploy, a reboot, running out of memory).
 * Left in place, it would stop every later scheduled run of its task. It is removed; the next
 * scheduled run does the work again (every task picks up where the data differs). An interrupted
 * ROR import is also shown in the admin (System → ROR import).
 */
export async function releaseInterruptedJobs(payload: Payload): Promise<void> {
  const where = { processing: { equals: true } }
  const { docs } = await payload.find({
    collection: 'payload-jobs',
    where,
    select: { taskSlug: true },
    depth: 0,
    pagination: false,
  })
  if (docs.length === 0) return
  await payload.delete({ collection: 'payload-jobs', where })
  const tasks = [...new Set(docs.map((doc) => doc.taskSlug ?? 'workflow'))].sort()
  if (tasks.includes('rorImport')) {
    await payload.updateGlobal({
      slug: 'ror-import',
      data: { lastError: 'An import was cut off by a restart. The next nightly run continues it.' },
    })
  }
  payload.logger.warn(
    `Released ${docs.length} scheduled job${docs.length === 1 ? '' : 's'} that a restart cut off: ${tasks.join(', ')}`,
  )
}
