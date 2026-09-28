import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { autoRunCrons } from './autorun'
import { MAINTENANCE_QUEUE } from './maintenance'

type CronJob = { nextRuns: (count: number, previous?: Date) => Date[] }
type Croner = { Cron: new (pattern: string, options: object) => CronJob }

// Payload's own cron parser (croner, a dependency of Payload), so the times are read exactly as
// the scheduler reads them; the options are those Payload passes.
const require = createRequire(import.meta.url)
const { Cron } = createRequire(require.resolve('payload'))('croner') as Croner
const fireTimes = (cron: string, count: number, from: Date) =>
  new Cron(cron, { paused: true, sloppyRanges: true }).nextRuns(count, from)

const ticks = autoRunCrons({ PAYLOAD_JOBS_AUTORUN: 'true' })

describe('autoRunCrons', () => {
  it('ticks only where PAYLOAD_JOBS_AUTORUN is "true"', () => {
    expect(autoRunCrons({})).toEqual([])
    expect(autoRunCrons({ PAYLOAD_JOBS_AUTORUN: 'false' })).toEqual([])
    expect(ticks.map((tick) => tick.queue)).toEqual(['ror', MAINTENANCE_QUEUE])
  })

  it('never ticks two queues in the same second, so neither undoes the schedule record of the other', () => {
    // 600 maintenance ticks (10 hours) against the ROR ticks of the same hours.
    const from = new Date('2026-10-15T00:00:00.000Z')
    const taken = new Map<number, string>()
    for (const { cron, queue } of ticks) {
      for (const at of fireTimes(cron as string, 600, from)) {
        const second = Math.floor(at.getTime() / 1000)
        expect(taken.get(second), `${queue} at ${at.toISOString()}`).toBeUndefined()
        taken.set(second, queue as string)
      }
    }
  })

  it('runs the maintenance queue every minute, and starts the nightly ROR import half a minute after 03:30', () => {
    const [ror, maintenance] = ticks
    expect(
      fireTimes(ror?.cron as string, 2, new Date('2026-10-15T03:25:00.000Z')).map((at) =>
        at.toISOString(),
      ),
    ).toEqual(['2026-10-15T03:30:30.000Z', '2026-10-15T03:40:30.000Z'])
    expect(
      fireTimes(maintenance?.cron as string, 2, new Date('2026-10-15T04:14:30.000Z')).map((at) =>
        at.toISOString(),
      ),
    ).toEqual(['2026-10-15T04:15:00.000Z', '2026-10-15T04:16:00.000Z'])
  })
})
