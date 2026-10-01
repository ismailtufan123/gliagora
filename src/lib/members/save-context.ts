import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'

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
