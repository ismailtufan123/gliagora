import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { MAINTENANCE_TASKS, MONITOR_TASKS } from './maintenance'
import { RorImportTask } from './rorImport'

// Payload stores each job's task name in an enum of PostgreSQL. A new task needs a migration that
// adds its name (pnpm migrate:create), or the scheduler cannot queue it on the server: the
// migrations' last snapshot must list every task of payload.config.ts.
const folder = new URL('../migrations/', import.meta.url)
const last = readdirSync(folder)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .at(-1)!
const snapshot = JSON.parse(readFileSync(new URL(last, folder), 'utf8')) as {
  enums: Record<string, { values: string[] }>
}

describe('task names in the database', () => {
  const tasks = [RorImportTask, ...MAINTENANCE_TASKS, ...MONITOR_TASKS].map((task) => task.slug)

  it.each(['public.enum_payload_jobs_task_slug', 'public.enum_payload_jobs_log_task_slug'])(
    '%s holds every task',
    (name) => {
      expect(snapshot.enums[name]?.values).toEqual(expect.arrayContaining(tasks))
    },
  )
})
