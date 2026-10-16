// Runs the scheduled maintenance tasks once: pnpm jobs:run [task …]
// For local testing (with fake data, D38) and for the operator: the same tasks, with the same
// rules, that the production server runs on its schedule (src/jobs/maintenance/, M4.7). Without
// names it runs all of them, in the order of MAINTENANCE_TASKS; with names, only those. The
// emails are sent only when SMTP_HOST is set (locally: Mailpit, see compose.yaml).
//
// The jobs go into a queue of their own, which the app's scheduler never runs, and each task
// takes a lock, so a run here and a scheduled run never do the same work at once.
import config from '@payload-config'
import { type TaskType, getPayload } from 'payload'

import { MAINTENANCE_TASKS, MANUAL_QUEUE, MONITOR_TASKS } from '@/jobs/maintenance'

// The monitors (M7) read other sites, so they run only when named.
const maintenance = MAINTENANCE_TASKS.map((task) => task.slug)
const known = [...maintenance, ...MONITOR_TASKS.map((task) => task.slug)]
const asked = process.argv.slice(2)
const unknown = asked.filter((name) => !known.includes(name))
if (unknown.length > 0) {
  console.error(`Unknown task: ${unknown.join(', ')}. The tasks are: ${known.join(', ')}.`)
  process.exit(1)
}
const tasks = asked.length > 0 ? known.filter((slug) => asked.includes(slug)) : maintenance

const payload = await getPayload({ config })
let failed = 0
try {
  for (const task of tasks) {
    const job = await payload.jobs.queue({ task: task as TaskType, input: {}, queue: MANUAL_QUEUE })
    // The tasks log their own counts when they did something.
    await payload.jobs.runByID({ id: job.id, silent: { info: true } })
    const left = await payload.find({
      collection: 'payload-jobs',
      where: { id: { equals: job.id } },
      select: { hasError: true },
      depth: 0,
      limit: 1,
    })
    // A job that succeeded is deleted; one that failed stays, with its error class and code.
    if (left.docs[0]?.hasError) {
      failed++
      payload.logger.error(`${task}: failed (payload-jobs ${job.id})`)
    } else {
      payload.logger.info(`${task}: done`)
    }
  }
} catch (error) {
  payload.logger.error(`jobs:run stopped: ${error instanceof Error ? error.name : typeof error}`)
  failed++
}
payload.logger.info(`jobs:run: ${tasks.length - failed} of ${tasks.length} tasks done`)
process.exit(failed > 0 ? 1 : 0)
