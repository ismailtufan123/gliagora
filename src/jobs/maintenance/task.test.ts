import { EventEmitter } from 'node:events'

import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { RorImportTask } from '../rorImport'
import { MAINTENANCE_QUEUE, MAINTENANCE_TASKS, MANUAL_QUEUE } from './index'
import { SKIPPED, logCounts, maintenanceTask, releaseCutOffJobs, withTaskLock } from './task'

/** A pool whose lock is taken once `held` is true; its client emits events as pg's does. */
function fakePool(held = false) {
  const queries: string[] = []
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn(async (text: string, _values?: unknown[]) => {
      queries.push(text)
      return { rows: [{ locked: !held }] }
    }),
    release: vi.fn(),
  })
  return { pool: { connect: vi.fn(async () => client) }, client, queries }
}

const fakePayload = (held = false, jobs: { processing: number } = { processing: 0 }) => {
  const { pool, client, queries } = fakePool(held)
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const count = vi.fn(async () => ({ totalDocs: jobs.processing }))
  const remove = vi.fn(async () => ({
    docs: Array.from({ length: jobs.processing }, (_, id) => ({ id })),
    errors: [],
  }))
  return {
    payload: { db: { pool }, logger, count, delete: remove } as unknown as Payload,
    client,
    queries,
    logger,
    count,
    remove,
  }
}

describe('the maintenance tasks', () => {
  const schedules = Object.fromEntries(
    MAINTENANCE_TASKS.map((task) => [task.slug, task.schedule?.map((s) => s.cron)]),
  )

  it('are scheduled in the maintenance queue, in UTC', () => {
    expect(schedules).toEqual({
      expireListings: ['5 * * * *'],
      purgeFormLimits: ['5 * * * *'],
      syncJobPlaces: ['45 4 * * *'],
      purgeRetention: ['15 4 * * *'],
      notifySubmitters: ['*/15 * * * *'],
      acknowledgeReports: ['*/5 * * * *'],
      applyDeletionLog: ['*/10 * * * *'],
      purgeMemberAuth: ['10 * * * *'],
      cleanInactiveMembers: ['30 5 * * *'],
      sendRequestEmails: ['*/5 * * * *'],
    })
    for (const task of MAINTENANCE_TASKS) {
      expect(task.schedule?.every((s) => s.queue === MAINTENANCE_QUEUE)).toBe(true)
      // The next scheduled run is the retry.
      expect(task.retries).toBe(0)
    }
    expect(MANUAL_QUEUE).not.toBe(MAINTENANCE_QUEUE)
  })

  it('run the retention purge after the nightly ROR import, and the place sync after both', () => {
    expect(RorImportTask.schedule).toEqual([{ cron: '30 3 * * *', queue: 'ror' }])
    const minutes = (cron: string) => {
      const [minute, hour] = cron.split(' ').map(Number)
      return (hour as number) * 60 + (minute as number)
    }
    expect(minutes('15 4 * * *')).toBeGreaterThan(minutes('30 3 * * *'))
    expect(minutes('45 4 * * *')).toBeGreaterThan(minutes('15 4 * * *'))
  })
})

describe('withTaskLock', () => {
  it('runs the work under a PostgreSQL advisory lock and releases it', async () => {
    const { payload, client, queries } = fakePayload()
    expect(await withTaskLock(payload, 'purgeRetention', async () => 42)).toBe(42)
    expect(queries[0]).toContain('pg_try_advisory_lock')
    expect(queries[1]).toContain('pg_advisory_unlock')
    expect(client.query.mock.calls[0]?.[1]).toEqual(['gliagora:task:purgeRetention'])
    expect(client.release).toHaveBeenCalledWith(false)
  })

  it('skips the work while another run holds the lock', async () => {
    const { payload, client } = fakePayload(true)
    const work = vi.fn(async () => 1)
    expect(await withTaskLock(payload, 'purgeRetention', work)).toBe(SKIPPED)
    expect(work).not.toHaveBeenCalled()
    expect(client.release).toHaveBeenCalled()
  })

  it('survives a lost connection while the work runs, and does not reuse that connection', async () => {
    const { payload, client, logger } = fakePayload()
    const result = await withTaskLock(payload, 'purgeRetention', async () => {
      // pg emits this on a checked-out client whose connection drops (a server restart); without
      // a listener, Node.js would end the process.
      client.emit('error', new Error('Connection terminated unexpectedly'))
      return 'done'
    })
    expect(result).toBe('done')
    expect(client.release).toHaveBeenCalledWith(true)
    expect(client.listenerCount('error')).toBe(0)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('leaves no listener on a client that goes back to the pool', async () => {
    const { payload, client } = fakePayload()
    for (let run = 0; run < 3; run++) await withTaskLock(payload, 'x', async () => run)
    expect(client.listenerCount('error')).toBe(0)
    expect(client.release).toHaveBeenLastCalledWith(false)
  })

  it('releases the lock when the work fails', async () => {
    const { payload, queries } = fakePayload()
    await expect(
      withTaskLock(payload, 'x', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(queries.at(-1)).toContain('pg_advisory_unlock')
  })
})

describe('maintenanceTask', () => {
  const run = (task: ReturnType<typeof maintenanceTask>, payload: Payload) =>
    (task.handler as (args: { req: PayloadRequest }) => Promise<unknown>)({
      req: { payload } as PayloadRequest,
    })

  it('stores the counts of a run, with "now" taken once', async () => {
    const { payload } = fakePayload()
    const work = vi.fn(async (_payload: Payload, now: Date) => ({ done: now ? 3 : 0 }))
    const task = maintenanceTask({
      slug: 't',
      label: 'T',
      cron: '* * * * *',
      counts: ['done'],
      run: work,
    })
    expect(task.outputSchema).toEqual([
      { name: 'done', type: 'number' },
      { name: 'skipped', type: 'checkbox' },
    ])
    expect(await run(task, payload)).toEqual({ output: { done: 3, skipped: false } })
    expect(work.mock.calls[0]?.[1]).toBeInstanceOf(Date)
  })

  it('records a skipped run when another holds the lock', async () => {
    const { payload } = fakePayload(true)
    const task = maintenanceTask({
      slug: 't',
      label: 'T',
      cron: '* * * * *',
      counts: [],
      run: async () => ({}),
    })
    expect(await run(task, payload)).toEqual({ output: { skipped: true } })
  })

  it('fails with the error class and code only, so no personal data reaches the logs or the job', async () => {
    const { payload, logger } = fakePayload()
    const task = maintenanceTask({
      slug: 'notifySubmitters',
      label: 'T',
      cron: '* * * * *',
      counts: [],
      run: async () => {
        throw Object.assign(new Error('Failed query … params: someone@example.org'), {
          code: '23505',
        })
      },
    })
    const failure = run(task, payload)
    await expect(failure).rejects.toThrow('notifySubmitters failed: Error 23505')
    await failure.catch((error: Error) => expect(error.message).not.toContain('@'))
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('someone@example.org')
  })
})

describe('releaseCutOffJobs', () => {
  it('removes the jobs of a task still marked as processing while no run holds its lock', async () => {
    const { payload, remove, logger } = fakePayload(false, { processing: 1 })
    expect(await releaseCutOffJobs(payload, 'purgeRetention')).toBe(1)
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-jobs',
        where: {
          and: [
            { queue: { equals: MAINTENANCE_QUEUE } },
            { taskSlug: { equals: 'purgeRetention' } },
            { processing: { equals: true } },
          ],
        },
      }),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      'purgeRetention: released 1 job that a database interruption cut off',
    )
  })

  it('leaves them while a run holds the lock, and takes no lock when there are none', async () => {
    const running = fakePayload(true, { processing: 1 })
    expect(await releaseCutOffJobs(running.payload, 'purgeRetention')).toBe(0)
    expect(running.remove).not.toHaveBeenCalled()
    const idle = fakePayload(false, { processing: 0 })
    expect(await releaseCutOffJobs(idle.payload, 'purgeRetention')).toBe(0)
    expect(idle.queries).toEqual([])
  })

  it('runs at every tick of a maintenance task, before Payload decides whether to queue it', async () => {
    const { payload, remove } = fakePayload(false, { processing: 1 })
    const [schedule] = MAINTENANCE_TASKS[0]?.schedule ?? []
    const defaultBeforeSchedule = vi.fn(async () => ({ shouldSchedule: true }))
    const result = await schedule?.hooks?.beforeSchedule?.({
      defaultBeforeSchedule,
      jobStats: {} as never,
      queueable: {} as never,
      req: { payload } as PayloadRequest,
    })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(defaultBeforeSchedule).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ shouldSchedule: true })
  })
})

describe('logCounts', () => {
  it('logs one line with what was done, and nothing when nothing was', () => {
    const { payload, logger } = fakePayload()
    logCounts(payload, 'purgeRetention', { snippets: 2, suggestions: 0, reports: 1 })
    expect(logger.info).toHaveBeenCalledWith('purgeRetention: 2 snippets, 1 reports')
    logger.info.mockClear()
    logCounts(payload, 'purgeRetention', { snippets: 0 })
    expect(logger.info).not.toHaveBeenCalled()
  })
})
