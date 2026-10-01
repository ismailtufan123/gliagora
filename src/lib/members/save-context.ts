import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { jobForSaving, requestTime } from '@/lib/records'

import { parseSave } from './return-path'
import { isSavable } from './saved'
import { anyMethod, currentMember, memberRequest } from './session'
import { countSavedItems, memberDb, savedJobIds } from './store'

// How a page draws its Save controls (M4b, D49; the M4b design §3), read once per page for all its
// rows: nothing while no way of signing in is on (production until the operator sets the keys:
// the pages stay as they were), a link to sign in for visitors who are signed out, and a form for
// members, pressed for the jobs they have saved. Only the pages that show Save controls ask (the
// jobs list, job pages, the saved page and the sign-in page), so other pages stay static and
// visitors without a session cookie cost no query. If the member's data cannot be read, the page
// shows no Save controls rather than wrong ones.

export type SaveContext =
  /** `next`: the page's own address, where signing in returns (with the job saved). */
  | { signedIn: false; next: string }
  /** `back`: the page's own address, where a Save returns without JavaScript. */
  | { signedIn: true; saved: ReadonlySet<number>; back: string }

/**
 * The Save context of a page at `here` (its canonical path and query) showing the jobs `jobIds`,
 * or null when it shows no Save controls.
 */
export async function saveContext(
  here: string,
  jobIds: readonly number[],
): Promise<SaveContext | null> {
  const { origin, methods } = await memberRequest()
  if (!origin || !anyMethod(methods)) return null
  try {
    const current = await currentMember()
    if (!current) return { signedIn: false, next: here }
    const db = memberDb(await getPayload({ config }))
    return { signedIn: true, saved: await savedJobIds(db, current.member.id, jobIds), back: here }
  } catch (error) {
    const reference = newReference()
    console.error(`Save controls left out (reference ${reference}): ${errorSummary(error)}`)
    return null
  }
}

/** A position as its Save control, and the line that names it before signing in, draw it. */
export type SaveJob = {
  id: number
  shortId: string
  title: string
  /** ISO 639-1 code of the posting's language (the title's). */
  originalLanguage: string
}

/**
 * The position a `save` value names (`job:k3f9a`: from a Save link, or carried through signing
 * in), while it can be saved, or null. Every page that leads to saving it names it (the sign-in
 * page, "Create your Gliagora account", the page an emailed sign-in link opens), so that a crafted
 * link never saves a position unseen; one that can no longer be saved is not named, and signing in
 * then leads to the saved page, which says why (saveAfterSignIn). Throws when the database cannot
 * be read.
 */
export async function positionToSave(value: unknown): Promise<SaveJob | null> {
  const ref = parseSave(typeof value === 'string' ? value : null)
  if (!ref) return null
  const job = await jobForSaving(ref.shortId)
  if (!job?.title || !job.shortId || !isSavable(job, requestTime())) return null
  return {
    id: job.id,
    shortId: job.shortId,
    title: job.title,
    originalLanguage: job.originalLanguage ?? 'en',
  }
}

/** How many items the signed-in member has saved (the account navigation), or null. */
export const savedCount = cache(async (): Promise<number | null> => {
  try {
    const current = await currentMember()
    if (!current) return null
    return await countSavedItems(memberDb(await getPayload({ config })), current.member.id)
  } catch (error) {
    const reference = newReference()
    console.error(`Saved count left out (reference ${reference}): ${errorSummary(error)}`)
    return null
  }
})
