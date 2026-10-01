import { OUTCOME_ID } from './paths'

// The message a member page shows after a redirect (M4b, D49; the M4b design §8): what was done
// (`?done=`) or what went wrong (`?error=`, with `&ref=` for an error the server logged). Anyone
// can write these into an address, so only known codes are shown, each with its own text from the
// messages; anything else shows nothing. A reference is shown only in the form newReference()
// makes, so an address cannot put other text on the page. Every redirect that carries an outcome
// ends in `#outcome`: the browser scrolls to the message and focuses it (Chromium skips
// `autofocus` when the address names a fragment).

/** What a redirect reports as done. Messages under `outcome.done`. */
export const DONE_CODES = ['signed-in', 'created'] as const
/** What a redirect reports as gone wrong. Messages under `outcome.error`. */
export const ERROR_CODES = ['link-expired', 'failed'] as const

export type DoneCode = (typeof DONE_CODES)[number]
export type ErrorCode = (typeof ERROR_CODES)[number]

export type Outcome =
  { kind: 'done'; code: DoneCode } | { kind: 'error'; code: ErrorCode; reference: string | null }

/** The form of `newReference()` (src/lib/forms/public-form.ts): 5 bytes in upper-case hex. */
export const REFERENCE_PATTERN = /^[0-9A-F]{10}$/

type Params = Record<string, string | string[] | undefined>

const single = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined

/**
 * The outcome in a page's query, if it names one of the codes this page shows (`done` and `error`
 * list them; a page shows only those its own redirects send). An error wins over a success.
 */
export function readOutcome(
  params: Params,
  allowed: { done?: readonly DoneCode[]; error?: readonly ErrorCode[] },
): Outcome | null {
  const error = single(params.error)
  const errorCode = allowed.error?.find((code) => code === error)
  if (errorCode) {
    const ref = single(params.ref)
    return {
      kind: 'error',
      code: errorCode,
      reference: ref && REFERENCE_PATTERN.test(ref) ? ref : null,
    }
  }
  const done = single(params.done)
  const doneCode = allowed.done?.find((code) => code === done)
  return doneCode ? { kind: 'done', code: doneCode } : null
}

/** A page's address with an outcome, for a redirect: `/en/account/?done=created#outcome`. */
export function outcomePath(
  path: string,
  outcome: { done: DoneCode } | { error: ErrorCode; reference?: string },
): string {
  const query = new URLSearchParams()
  if ('done' in outcome) query.set('done', outcome.done)
  else {
    query.set('error', outcome.error)
    if (outcome.reference && REFERENCE_PATTERN.test(outcome.reference)) {
      query.set('ref', outcome.reference)
    }
  }
  return `${path}?${query.toString()}#${OUTCOME_ID}`
}
