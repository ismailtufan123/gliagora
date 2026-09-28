import { randomBytes } from 'node:crypto'

import { errorCode } from '@/lib/errors'

import { type SpamChallenge, checkAnswer, newChallenge } from './altcha'
import { clientIp, hashClientIp } from './client-ip'
import { FORM_INPUTS } from './fields'
import { type LimitBucket, type LimitStore, admit } from './rate-limit'

// What happens when someone sends a public form ("Suggest a listing", "Report a problem"; PLAN
// §3.2, §18.2). The checks run cheapest first: the fields, the hidden field, the spam check, then
// the rate limit (the only one that needs the database), and only then is the form stored. Each
// form describes its fields (a `PublicForm`); its Server Action passes in what this needs, so
// tests can too.

/** Problems with the whole form rather than a field; messages under `{form}.errors`. */
export type FormProblem = 'needsJs' | 'spamCheck' | 'rateLimited' | 'unavailable' | 'failed'

export type FormOutcome<Values, Errors> =
  | { kind: 'sent' }
  | { kind: 'invalid'; status: 400; errors: Errors; values: Values }
  | {
      kind: 'refused'
      status: 400 | 429 | 503
      problem: Exclude<FormProblem, 'failed'>
      values: Values
    }
  | { kind: 'failed'; status: 500; reference: string; values: Values }

export type FormDependencies<Data> = {
  /** ALTCHA_HMAC_KEY (null when missing: the form is unavailable). */
  altchaKey: string | null
  /** PAYLOAD_SECRET, from which the key for hashing IP addresses is derived. */
  secret: string
  headers: { get(name: string): string | null }
  now: Date
  /** The rate-limit store; asked for only when a form has passed the other checks. */
  limits: () => Promise<LimitStore>
  /** Stores what was sent. */
  save: (data: Data) => Promise<void>
}

export type Parse<Data, Errors> = { ok: true; data: Data } | { ok: false; errors: Errors }

/** One public form: how to read and check its fields, and its rate-limit bucket. */
export type PublicForm<Values, Data, Errors> = {
  /** Names what is stored, in the server log ("Suggestion not saved …"). */
  name: string
  limit: LimitBucket
  /** The fields as sent: shown again in the form after an error. */
  read: (form: FormData) => Values
  parse: (values: Values, locale: string) => Parse<Data, Errors>
}

/** A form field's text; anything else (a file, a missing field) counts as empty. */
export function formText(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/** The inputs every public form sends besides its fields. */
export function readControls(form: FormData) {
  return {
    locale: formText(form, FORM_INPUTS.locale),
    altcha: formText(form, FORM_INPUTS.altcha),
    honeypot: formText(form, FORM_INPUTS.honeypot),
  }
}

/** A short code a person can quote, which also appears in the server log with the error. */
export function newReference(): string {
  return randomBytes(5).toString('hex').toUpperCase()
}

/**
 * Logs a failure without personal data: only the error's class and its database code, never a
 * message, which can quote what was sent (PostgreSQL does, and Drizzle adds the query's values).
 */
export function logFailure(name: string, reference: string, error: unknown) {
  const kind = error instanceof Error ? error.name : typeof error
  console.error(`${name} not saved (reference ${reference}):`, kind, errorCode(error) ?? '')
}

export async function handlePublicForm<Values, Data, Errors>(
  form: FormData,
  deps: FormDependencies<Data>,
  spec: PublicForm<Values, Data, Errors>,
): Promise<FormOutcome<Values, Errors>> {
  const values = spec.read(form)
  const { locale, altcha, honeypot } = readControls(form)
  if (!deps.altchaKey || !deps.secret) {
    return { kind: 'refused', status: 503, problem: 'unavailable', values }
  }

  const parsed = spec.parse(values, locale)
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
      bucket: spec.limit,
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
    logFailure(spec.name, reference, error)
    return { kind: 'failed', status: 500, reference, values }
  }
  return { kind: 'sent' }
}

/**
 * What a form shows: its values, the message for each field with a problem and one for the whole
 * form, and the challenge for the next spam check. `attempt` counts failed sends, so the form
 * moves focus to the error summary after each one.
 */
export type FormState<Values> = {
  values: Values
  fieldErrors: Partial<Record<keyof Values, string>>
  formError: string | null
  /** 400, 429, 500 or 503, like the HTTP status an API would answer; 200 before sending. */
  status: number
  challenge: SpamChallenge | null
  attempt: number
}

/** A form before anything was sent, with its first challenge (none without the ALTCHA key). */
export async function initialFormState<Values>(
  values: Values,
  key: string | null,
): Promise<FormState<Values>> {
  return {
    values,
    fieldErrors: {},
    formError: null,
    status: 200,
    challenge: key ? await newChallenge(key) : null,
    attempt: 0,
  }
}

/** The message for a code under `{form}.errors`; `reference` only for "failed". */
export type ErrorText = (code: string, values?: { reference: string }) => string

/**
 * The state a Server Action returns after a send that was not taken: the messages in the
 * person's language and a new challenge, since an answer is used once and may have expired.
 */
export async function stateAfter<Values, Errors extends Partial<Record<keyof Values, string>>>(
  outcome: Exclude<FormOutcome<Values, Errors>, { kind: 'sent' }>,
  previous: FormState<Values> | undefined,
  message: ErrorText,
  key: string | null,
): Promise<FormState<Values>> {
  const fieldErrors: FormState<Values>['fieldErrors'] = {}
  if (outcome.kind === 'invalid') {
    for (const [field, code] of Object.entries(outcome.errors)) {
      if (typeof code === 'string') fieldErrors[field as keyof Values] = message(code)
    }
  }
  return {
    values: outcome.values,
    fieldErrors,
    formError:
      outcome.kind === 'refused'
        ? message(outcome.problem)
        : outcome.kind === 'failed'
          ? message('failed', { reference: outcome.reference })
          : null,
    status: outcome.status,
    challenge: key ? await newChallenge(key) : null,
    // Without JavaScript, React posts the previous state with the form, so it is not trusted.
    attempt: (Number.isSafeInteger(previous?.attempt) ? (previous?.attempt ?? 0) : 0) + 1,
  }
}
