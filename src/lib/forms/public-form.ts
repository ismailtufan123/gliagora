import { randomBytes } from 'node:crypto'

import { errorCode } from '@/lib/errors'

import { type SpamChallenge, checkAnswer, newChallenge } from './altcha'
import { clientIp, hashClientIp } from './client-ip'
import { emailCap } from './email-cap'
import { FORM_INPUTS } from './fields'
import {
  LIMIT_WINDOW_MS,
  type Limit,
  type LimitBucket,
  type LimitStore,
  admit,
  ipLimit,
} from './rate-limit'

// What happens when someone sends a public form ("Suggest a listing", "Report a problem"; from M4b
// also the forms that email a link; PLAN §3.2, §18.2). The checks run cheapest first: the fields,
// the hidden field, the spam check, then the rate limits (the only check that needs the
// database), and only then is the form stored. Each form describes its fields (a `PublicForm`);
// its Server Action passes in what this needs, so tests can too.
//
// Next.js forwards a Server Action posted to a page that does not have it to the page that does
// (adding `x-action-forwarded`), and that internal request goes straight to the app, past Caddy.
// Our forms always post to the page that shows them, so they are never forwarded; a forwarded call
// is someone running a form through another page, which at M2 could be a public page running a form
// that is still behind the site-wide password. It is refused before the form is read (D49). With
// Next.js 16.3.6 the forward meets the site's trailing-slash redirect and never reaches the form;
// the refusal keeps it so if that changes (tests/e2e/actions.spec.ts checks both).

/** The header Next.js adds to a Server Action it forwards from another page. */
export const FORWARDED_ACTION_HEADER = 'x-action-forwarded'

/**
 * Problems with the whole form rather than a field; messages under `{form}.errors`. `signedOut`:
 * a form for members only (adding an address to the account) sent without a session. `wait`: the
 * newsletter form sent again for one address within a minute (`newsletterWait`).
 */
export type FormProblem =
  'needsJs' | 'spamCheck' | 'rateLimited' | 'wait' | 'unavailable' | 'signedOut' | 'failed'

export type FormOutcome<Values, Errors> =
  | { kind: 'sent' }
  | { kind: 'invalid'; status: 400; errors: Errors; values: Values }
  | {
      kind: 'refused'
      status: 400 | 401 | 429 | 503
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
  /**
   * Stores what was sent (and sends its email, for the forms that send one). `'unavailable'` when
   * that could not be done just now (the mail server did not take the email): the form says
   * "temporarily unavailable", and `save` has removed what it stored.
   */
  save: (data: Data) => Promise<void | 'unavailable'>
}

export type Parse<Data, Errors> = { ok: true; data: Data } | { ok: false; errors: Errors }

/** One public form: how to read and check its fields, and its rate limits. */
export type PublicForm<Values, Data, Errors> = {
  /** Names what is stored, in the server log ("Suggestion not saved …"). */
  name: string
  /** Its own limit per hashed IP address. */
  limit: LimitBucket
  /**
   * Limits that depend on what was sent, checked after the IP's: for the forms that send an email,
   * the budget of the address it goes to and the site-wide cap (`emailLimits`).
   */
  moreLimits?: (data: Data, secret: string) => Limit[]
  /** The fields as sent: shown again in the form after an error. */
  read: (form: FormData) => Values
  parse: (values: Values, locale: string) => Parse<Data, Errors>
  /**
   * For a form that only a signed-in member may send: `signedOut` without a session, which
   * refuses the form before anything is checked, counted, stored or sent.
   */
  gate?: () => 'signedOut' | null
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

/** When the log last said that the site-wide cap on emails was reached (once an hour at most). */
let capWarnedAt = Number.NEGATIVE_INFINITY

/**
 * One warning line in the log when the site-wide cap on the emails the forms send is reached (the
 * only limit that answers "temporarily unavailable"), so the operator learns that people are being
 * turned away. Once an hour at most, however many requests the cap refuses. It quotes the cap in
 * force (EMAIL_CAP_HOUR, EMAIL_CAP_DAY, or the default).
 */
export function warnSiteWideCap(name: string, now: Date, cap = emailCap()) {
  if (now.getTime() - capWarnedAt < LIMIT_WINDOW_MS) return
  capWarnedAt = now.getTime()
  console.warn(
    `${name}: the site-wide limit on emails from the forms is reached (${cap.hour} an hour, ${cap.day} a day); the forms that send an email say "temporarily unavailable" until it frees up.`,
  )
}

export async function handlePublicForm<Values, Data, Errors>(
  form: FormData,
  deps: FormDependencies<Data>,
  spec: PublicForm<Values, Data, Errors>,
): Promise<FormOutcome<Values, Errors>> {
  if (deps.headers.get(FORWARDED_ACTION_HEADER) !== null) {
    // Answered as a failed spam check: nothing is read, stored, counted or sent.
    console.warn(`${spec.name}: a forwarded Server Action was refused`)
    return { kind: 'refused', status: 400, problem: 'spamCheck', values: spec.read(new FormData()) }
  }
  const values = spec.read(form)
  const { locale, altcha, honeypot } = readControls(form)
  const gate = spec.gate?.() ?? null
  if (gate) return { kind: 'refused', status: 401, problem: gate, values }
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
      keys: [
        ipLimit(spec.limit, hashClientIp(clientIp(deps.headers), deps.secret)),
        ...(spec.moreLimits?.(parsed.data, deps.secret) ?? []),
      ],
      replayKey: answer.replayKey,
      now: deps.now,
    })
    if (admission === 'replayed') {
      return { kind: 'refused', status: 400, problem: 'spamCheck', values }
    }
    if (admission === 'rateLimited' || admission === 'wait') {
      return { kind: 'refused', status: 429, problem: admission, values }
    }
    if (admission === 'unavailable') {
      warnSiteWideCap(spec.name, deps.now)
      return { kind: 'refused', status: 503, problem: 'unavailable', values }
    }
    if ((await deps.save(parsed.data)) === 'unavailable') {
      return { kind: 'refused', status: 503, problem: 'unavailable', values }
    }
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
  /** 400, 401, 429, 500 or 503, like the HTTP status an API would answer; 200 before sending. */
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
