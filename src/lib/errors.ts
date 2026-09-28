// Describing errors without personal data (PLAN §18.2, CLAUDE.md): an error's message can quote
// what was sent or stored (PostgreSQL does, Drizzle adds the query's values, and a mail server
// names the recipient it refused), so logs and stored job errors get only its class and codes.

/**
 * The error's code (e.g. 22021 for a character PostgreSQL cannot store, or ECONNECTION from the
 * mail transport). Drizzle wraps the driver's error, so the code is on a cause rather than on the
 * error itself.
 */
export function errorCode(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' || typeof code === 'number') return String(code)
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** The class, the code and an SMTP reply code (e.g. "Error EENVELOPE 550"), never the message. */
export function errorSummary(error: unknown): string {
  const kind = error instanceof Error ? error.name : typeof error
  const code = errorCode(error)
  const reply = (error as { responseCode?: unknown } | null)?.responseCode
  return [kind, code, typeof reply === 'number' ? String(reply) : undefined]
    .filter(Boolean)
    .join(' ')
}

/**
 * Where the error was thrown: the stack without its first line, which repeats the message. File
 * names and line numbers only.
 */
export function errorFrames(error: unknown, count = 5): string {
  if (!(error instanceof Error) || !error.stack) return ''
  return error.stack
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .slice(0, count)
    .join('\n')
}
