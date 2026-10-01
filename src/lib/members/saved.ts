import { matchDetailRoute } from '@/lib/detail-routes'
import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { type ListingDates, listingState } from '@/lib/jobs/deadline'

import { appOrigin, sameOrigin } from './origin'
import { type ErrorCode, outcomePath } from './outcome'
import { MEMBER_PATHS } from './paths'
import { forbidden, formValue, readForm, seeOther } from './responses'
import { DEFAULT_NEXT, type SaveRef, parseSave, safeNext, saveValue } from './return-path'
import type { SaveOutcome } from './store'

// Saving positions (M4b, D49; the M4b design §3). Every Save button is a plain form that posts to
// one route, `/en/account/saved/toggle/`, with the item (`job:k3f9a`), the state the member wants
// (`saved=1` or `0`, so sending it twice changes nothing) and the page to return to (`back`).
// Without JavaScript the route answers with a 303 back to that page, at the row (`#job-k3f9a`) or,
// on the job's own page, at its Save control (`#save`); with JavaScript (`Accept: application/json`)
// it answers `{ saved }` and the page stays as it is. A job can be saved while it is public (open,
// or closed less than 30 days ago); removing works whatever the job's state, so the saved page can
// remove closed and withdrawn positions. A Save the route refuses (500 saved, or no longer public)
// leads to the saved page, which says why: a jobs-list address would lose the message in its
// canonical redirect. The same rules save the job a visitor pressed Save on before signing in.

/** The ID of a row with a Save control; only rows with one get it, so no ID repeats on a page. */
export const jobRowId = (shortId: string) => `job-${shortId}`
/** The ID of the Save control on a job's own page. */
export const SAVE_CONTROL_ID = 'save'
/** The page's live region, which the script fills with "Saved: …" (save-toggle.ts). */
export const SAVE_STATUS_ID = 'save-status'
/** The visually hidden note that a Save link leads to signing in. */
export const SAVE_NOTE_ID = 'save-signin-note'

/** The input names of a Save form. */
export const SAVE_INPUTS = { item: 'item', saved: 'saved', back: 'back' } as const

/** Whether `path` (with or without a query) is the page of the job `shortId`. */
function isJobPage(path: string, shortId: string): boolean {
  const route = matchDetailRoute(path.split(/[?#]/, 1)[0]!)
  return route?.kind === 'job' && route.shortId === shortId
}

/** `path` at the job's Save control: its row, or its own page's control. */
export const atSaveControl = (path: string, shortId: string) =>
  `${path}#${isJobPage(path, shortId) ? SAVE_CONTROL_ID : jobRowId(shortId)}`

/** The sign-in page that returns to `next` and saves `ref` on the way. */
export function signInToSave(next: string, ref: SaveRef | null): string {
  const query = new URLSearchParams({ next })
  if (ref) query.set('save', saveValue(ref))
  return `${MEMBER_PATHS.signIn}?${query.toString()}`
}

/** Whether a job may be saved: public, that is open or closed less than 30 days ago. */
export const isSavable = (job: ListingDates, now: Date) => {
  const state = listingState(job, now)
  return state === 'open' || state === 'closed'
}

/** A job as saving needs it: its ID and the dates that say whether it is public. */
export type SavableJob = ListingDates & { id: number }

/** What the toggle and saving after sign-in read and write (saved-store.ts gives the real ones). */
export type SaveStore = {
  now: Date
  /** The job with this short ID, in any status, or null. */
  job(shortId: string): Promise<SavableJob | null>
  save(memberId: number, jobId: number): Promise<SaveOutcome>
  unsave(memberId: number, jobId: number): Promise<boolean>
}

export type ToggleDeps = SaveStore & {
  /** The member of the request's session cookie, or null when it has no valid session. */
  member(): Promise<number | null>
  env?: Record<string, string | undefined>
}

/** The saved page with why a Save was refused, or with a failure's reference. */
const savedPageError = (error: ErrorCode, reference?: string) =>
  outcomePath(MEMBER_PATHS.saved, reference ? { error, reference } : { error })

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const wantsJson = (headers: Headers) =>
  (headers.get('accept') ?? '').toLowerCase().includes('application/json')

/** The saved page's own page number in `back`, kept when a removal leads back to it. */
function savedPage(back: string): { page: string | null } | null {
  const url = new URL(back, 'http://site.invalid')
  if (url.pathname !== MEMBER_PATHS.saved) return null
  const page = url.searchParams.get('page')
  return { page: page && /^[1-9]\d{0,4}$/.test(page) ? page : null }
}

/**
 * POST `/en/account/saved/toggle/`: saves or removes one item for the signed-in member. Only from
 * the site's own pages (`sameOrigin`). Signed out: JSON 401 with the sign-in address (the script
 * goes there), or a 303 to it; signing in then saves the item and returns here (`next`, `save`).
 */
export async function handleSaveToggle(request: Request, deps: ToggleDeps): Promise<Response> {
  if (!sameOrigin(request.headers, deps.env)) return forbidden()
  const origin = appOrigin(request.headers, deps.env)!
  const asJson = wantsJson(request.headers)
  const form = await readForm(request)
  const ref = parseSave(formValue(form, SAVE_INPUTS.item))
  const wanted = formValue(form, SAVE_INPUTS.saved)
  // Save buttons are never on the account page, so a missing or refused page means the list.
  const safeBack = safeNext(formValue(form, SAVE_INPUTS.back), origin)
  const back = safeBack === DEFAULT_NEXT ? MEMBER_PATHS.saved : safeBack
  const refused = (error: ErrorCode, status = 409) =>
    asJson ? json(status, { error }) : seeOther(savedPageError(error))

  try {
    const memberId = await deps.member()
    if (memberId === null) {
      const signIn = signInToSave(back, wanted === '1' ? ref : null)
      return asJson ? json(401, { signIn }) : seeOther(signIn)
    }
    if (!ref || (wanted !== '1' && wanted !== '0')) return refused('failed', 400)
    const saved = wanted === '1'
    const job = await deps.job(ref.shortId)
    if (saved) {
      if (!job || !isSavable(job, deps.now)) return refused('not-public')
      if ((await deps.save(memberId, job.id)) === 'full') return refused('saved-full')
    } else if (job) {
      await deps.unsave(memberId, job.id)
    }
    if (asJson) return json(200, { saved })
    // Removed on the saved page itself: its row is gone, so the page says what happened.
    const onSavedPage = saved ? null : savedPage(back)
    if (onSavedPage)
      return seeOther(outcomePath(MEMBER_PATHS.saved, { done: 'removed' }, onSavedPage))
    return seeOther(atSaveControl(back, ref.shortId))
  } catch (error) {
    const reference = newReference()
    console.error(`Save failed (reference ${reference}): ${errorSummary(error)}`)
    return asJson ? json(500, { error: 'failed' }) : seeOther(savedPageError('failed', reference))
  }
}

/**
 * After signing in (an email link, Google, ORCID or "Create account"): saves the job the visitor
 * pressed Save on before signing in (`save`, carried by the email link or the sealed sign-in
 * cookie), if it is still public. Returns where to go instead of `next`: back at the job's Save
 * control, or the saved page saying why it was not saved; null without a job to save, or when
 * sign-in leads to the account page anyway. A failure here never undoes the sign-in: it leads to
 * the saved page with a reference.
 */
export async function saveAfterSignIn(
  store: SaveStore,
  memberId: number,
  save: string | null | undefined,
  next: string,
): Promise<string | null> {
  const ref = parseSave(save)
  if (!ref) return null
  try {
    const job = await store.job(ref.shortId)
    if (!job || !isSavable(job, store.now)) return savedPageError('not-public')
    if ((await store.save(memberId, job.id)) === 'full') return savedPageError('saved-full')
  } catch (error) {
    const reference = newReference()
    console.error(`Save after sign-in failed (reference ${reference}): ${errorSummary(error)}`)
    return savedPageError('failed', reference)
  }
  return next === DEFAULT_NEXT ? null : atSaveControl(next, ref.shortId)
}
