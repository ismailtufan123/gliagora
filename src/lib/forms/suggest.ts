import { randomBytes } from 'node:crypto'

import { type SpamChallenge, checkAnswer } from './altcha'
import { clientIp, hashClientIp } from './client-ip'
import { type LimitStore, admit } from './rate-limit'
import {
  type FieldErrors,
  type SuggestValues,
  type SuggestionData,
  parseSuggestion,
  readSuggestForm,
} from './suggest-schema'

// What happens when someone sends the "Suggest a listing" form (PLAN §3.2, §18.2). The checks run
// cheapest first: the fields, the hidden field, the spam check, then the rate limit (the only one
// that needs the database), and only then is the suggestion stored. The Server Action
// (src/app/(frontend)/en/suggest/actions.ts) passes in what this needs, so tests can too.

/** Where the form leads once a suggestion is taken, or seems to be (the hidden field). */
export const SUGGEST_SENT_PATH = '/en/suggest/sent/'

/** The parts of the legal texts the form links to (headings in content/…, see markdown.ts). */
export const SUGGEST_LEGAL_LINKS = {
  privacy: '/en/legal/privacy/#suggest-a-listing-form',
  spamProtection: '/en/legal/privacy/#spam-protection-on-forms',
  kvkk: '/tr/legal/kvkk-aydinlatma-metni/#ilan-onerme-formu-suggest-a-listing',
} as const

/** Problems with the whole form rather than a field; messages under `suggest.errors`. */
export type FormProblem = 'needsJs' | 'spamCheck' | 'rateLimited' | 'unavailable' | 'failed'

export type SuggestOutcome =
  | { kind: 'sent' }
  | { kind: 'invalid'; status: 400; errors: FieldErrors; values: SuggestValues }
  | {
      kind: 'refused'
      status: 400 | 429 | 503
      problem: Exclude<FormProblem, 'failed'>
      values: SuggestValues
    }
  | { kind: 'failed'; status: 500; reference: string; values: SuggestValues }

export type SuggestDependencies = {
  /** ALTCHA_HMAC_KEY (null when missing: the form is unavailable). */
  altchaKey: string | null
  /** PAYLOAD_SECRET, from which the key for hashing IP addresses is derived. */
  secret: string
  headers: { get(name: string): string | null }
  now: Date
  /** The rate-limit store; asked for only when a suggestion has passed the other checks. */
  limits: () => Promise<LimitStore>
  /** Stores the suggestion (the Submissions collection makes the candidate for positions). */
  save: (data: SuggestionData) => Promise<void>
}

/** A short code a person can quote, which also appears in the server log with the error. */
export function newReference(): string {
  return randomBytes(5).toString('hex').toUpperCase()
}

/**
 * The database's error code (e.g. 22021 for a character PostgreSQL cannot store). Drizzle wraps
 * the driver's error, so the code is on a cause rather than on the error itself.
 */
function errorCode(error: unknown): string | undefined {
  let current = error
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' || typeof code === 'number') return String(code)
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/**
 * Logs a failure without personal data: only the error's class and its database code, never a
 * message, which can quote what was sent (PostgreSQL does, and Drizzle adds the query's values).
 */
export function logFailure(reference: string, error: unknown) {
  const name = error instanceof Error ? error.name : typeof error
  console.error(`Suggestion not saved (reference ${reference}):`, name, errorCode(error) ?? '')
}

export async function handleSuggestion(
  form: FormData,
  deps: SuggestDependencies,
): Promise<SuggestOutcome> {
  const { values, locale, altcha, honeypot } = readSuggestForm(form)
  if (!deps.altchaKey || !deps.secret) {
    return { kind: 'refused', status: 503, problem: 'unavailable', values }
  }

  const parsed = parseSuggestion(values, locale)
  if (!parsed.ok) return { kind: 'invalid', status: 400, errors: parsed.errors, values }

  // Filled in by a program, not a person: answer as if it worked, so it learns nothing, and
  // store nothing (not even a rate-limit entry).
  if (honeypot.trim() !== '') return { kind: 'sent' }

  const answer = await checkAnswer(altcha, deps.altchaKey, deps.now)
  if (!answer.ok) {
    return {
      kind: 'refused',
      status: 400,
      problem: answer.reason === 'missing' ? 'needsJs' : 'spamCheck',
      values,
    }
  }

  const reference = newReference()
  try {
    const admission = await admit(await deps.limits(), {
      ipHash: hashClientIp(clientIp(deps.headers), deps.secret),
      replayKey: answer.replayKey,
      now: deps.now,
    })
    if (admission === 'replayed') {
      return { kind: 'refused', status: 400, problem: 'spamCheck', values }
    }
    if (admission === 'rate-limited') {
      return { kind: 'refused', status: 429, problem: 'rateLimited', values }
    }
    await deps.save(parsed.data)
  } catch (error) {
    logFailure(reference, error)
    return { kind: 'failed', status: 500, reference, values }
  }
  return { kind: 'sent' }
}

/**
 * What the form shows: its values, the message for each field with a problem and one for the
 * whole form, and the challenge for the next spam check. `attempt` counts failed sends, so the
 * form moves focus to the error summary after each one.
 */
export type SuggestState = {
  values: SuggestValues
  fieldErrors: Partial<Record<keyof SuggestValues, string>>
  formError: string | null
  /** 400, 429, 500 or 503, like the HTTP status an API would answer; 200 before sending. */
  status: number
  challenge: SpamChallenge | null
  attempt: number
}

export const EMPTY_VALUES: SuggestValues = {
  url: '',
  kind: '',
  note: '',
  email: '',
  consent: false,
}
