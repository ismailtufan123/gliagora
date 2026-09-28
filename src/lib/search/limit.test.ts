import { describe, expect, it } from 'vitest'

import { TooBusyError, limiter } from './limit'

/** A task that runs until it is told to finish. */
function task(log: string[], name: string) {
  let finish!: () => void
  const done = new Promise<void>((resolve) => (finish = resolve))
  return {
    finish,
    run: async () => {
      log.push(`start ${name}`)
      await done
      log.push(`end ${name}`)
      return name
    },
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('limiter', () => {
  it('runs at most `running` tasks at once, then the waiting ones in turn', async () => {
    const log: string[] = []
    const run = limiter('tests', { running: 2, waiting: 2 })
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((name) => task(log, name))
    const results = [a!, b!, c!, d!].map((t) => run(t.run))
    await tick()
    expect(log).toEqual(['start a', 'start b'])
    b!.finish()
    await tick()
    expect(log).toEqual(['start a', 'start b', 'end b', 'start c'])
    a!.finish()
    c!.finish()
    d!.finish()
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('fails at once when as many tasks wait as allowed', async () => {
    const log: string[] = []
    const run = limiter('tests', { running: 1, waiting: 1 })
    const [a, b, c] = ['a', 'b', 'c'].map((name) => task(log, name))
    const first = run(a!.run)
    const second = run(b!.run)
    await expect(run(c!.run)).rejects.toBeInstanceOf(TooBusyError)
    a!.finish()
    b!.finish()
    await Promise.all([first, second])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('frees the place of a task that fails', async () => {
    const run = limiter('tests', { running: 1, waiting: 0 })
    await expect(run(() => Promise.reject(new Error('failed')))).rejects.toThrow('failed')
    await expect(run(() => Promise.resolve('next'))).resolves.toBe('next')
  })
})
