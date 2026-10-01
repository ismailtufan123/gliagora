import { OUTCOME_ID } from './paths'

// The message a member page shows after a redirect (M4b, D49; the M4b design §8): what was done
// (`?done=`) or what went wrong (`?error=`, with `&ref=` for an error the server logged). Anyone
// can write these into an address, so only known codes are shown, each with its own text from the
// messages; anything else shows nothing. A reference is shown only in the form newReference()
// makes, so an address cannot put other text on the page. Every redirect that carries an outcome
// ends in `#outcome`: the browser scrolls to the message and focuses it (Chromium skips
// `autofocus` when the address names a fragment).

/**
 * What a redirect reports as done. Messages under `outcome.done`. `signed-in-linked-google`: a
 * Google sign-in that found the account by the address Google manages, and so added Google to it
 * (the M4b design §7.3). `removed`: a saved position removed on the saved page without JavaScript,
 * whose row is then gone. The account's settings (§7.4): an address added by its link
 * (`email-verified`), Glia Notes switched on or off, the preferred subfields saved or all removed,
 * the display name saved or removed.
 */
export const DONE_CODES = [
  'signed-in',
  'signed-in-linked-google',
  'created',
  'linked-google',
  'linked-orcid',
  'unlinked-google',
  'unlinked-orcid',
  'removed',
  'email-verified',
  'digest-on',
  'digest-off',
  'subfields-saved',
  'subfields-removed',
  'name-saved',
  'name-removed',
] as const
/**
 * What a redirect reports as gone wrong. Messages under `outcome.error`. Besides the email link's
 * and a failure's: signing in with Google or ORCID, or linking them, that took too long or lost
 * its cookie (`expired`), was declined at the provider (`cancelled-google`, `cancelled-orcid`), or
 * lost its session while linking (`link-interrupted`); a Link button whose request did not say it
 * came from the site (`link-not-started`: an old browser without Sec-Fetch-Site, or the address
 * opened from elsewhere); too many accounts created from one connection (`create-limited`); and
 * the refusals of the account rules (src/lib/members/identity.ts, `Refusal`); and a Save refused
 * because the member has saved the most there may be (`saved-full`) or the position is no longer
 * public (`not-public`), shown on the saved page. The account's settings: an address that belongs
 * to another account (`email-taken`), a link to add an address that expired or was used
 * (`verify-expired`), Glia Notes without the consent box ticked (`digest-consent`) or without an
 * address (`digest-needs-email`), more preferred subfields than there may be
 * (`subfields-too-many`), and a display name that cannot be stored (`name-invalid`).
 */
export const ERROR_CODES = [
  'link-expired',
  'failed',
  'expired',
  'cancelled-google',
  'cancelled-orcid',
  'link-interrupted',
  'link-not-started',
  'create-limited',
  'email-has-other-google',
  'google-elsewhere',
  'orcid-elsewhere',
  'google-already-linked',
  'orcid-already-linked',
  'last-method',
  'saved-full',
  'not-public',
  'email-taken',
  'verify-expired',
  'digest-consent',
  'digest-needs-email',
  'subfields-too-many',
  'name-invalid',
] as const

export type DoneCode = (typeof DONE_CODES)[number]
export type ErrorCode = (typeof ERROR_CODES)[number]

export type Outcome =
  /**
   * `othersEnded`: the change of sign-in methods also signed the account out in other browsers
   * (`&others=ended`, the M4b design §7.3), which the message then says.
   */
  | { kind: 'done'; code: DoneCode; othersEnded: boolean }
  | { kind: 'error'; code: ErrorCode; reference: string | null }

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
  return doneCode
    ? { kind: 'done', code: doneCode, othersEnded: single(params.others) === 'ended' }
    : null
}

/**
 * A page's address with an outcome, for a redirect: `/en/account/?done=created#outcome`. `keep`
 * adds parameters the page reads besides the outcome (the sign-in page's `next`, so that trying
 * again still leads where the person was going).
 */
export function outcomePath(
  path: string,
  outcome: { done: DoneCode; othersEnded?: boolean } | { error: ErrorCode; reference?: string },
  keep: Record<string, string | null | undefined> = {},
): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(keep)) if (value) query.set(name, value)
  if ('done' in outcome) {
    query.set('done', outcome.done)
    if (outcome.othersEnded) query.set('others', 'ended')
  } else {
    query.set('error', outcome.error)
    if (outcome.reference && REFERENCE_PATTERN.test(outcome.reference)) {
      query.set('ref', outcome.reference)
    }
  }
  return `${path}?${query.toString()}#${OUTCOME_ID}`
}
