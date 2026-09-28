// A small in-memory limit on how many of one kind of task run at once (database.ts uses it for
// the institution search). The app runs as one Node.js process (`node server.js`, Dockerfile), so
// the limit holds for the whole site.

/** Thrown when as many tasks wait as the limit allows: the caller shows its error state. */
export class TooBusyError extends Error {
  constructor(what: string) {
    super(`Too many ${what} at once`)
    this.name = 'TooBusyError'
  }
}

/**
 * Runs at most `running` tasks at a time. Further tasks wait in turn, at most `waiting` of them;
 * one more fails at once (TooBusyError) rather than wait behind them.
 */
export function limiter(what: string, { running, waiting }: { running: number; waiting: number }) {
  let active = 0
  const queue: (() => void)[] = []
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < running) active++
    else if (queue.length < waiting) await new Promise<void>((start) => queue.push(start))
    else throw new TooBusyError(what)
    try {
      return await task()
    } finally {
      // The next waiting task takes this one's place; otherwise the place is free.
      const next = queue.shift()
      if (next) next()
      else active--
    }
  }
}
