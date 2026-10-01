import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'

import { currentMember } from './session'
import { memberDb, preferredSubfields } from './store'

// The signed-in member's preferred subfields (D35), for the jobs list's default filter
// (src/lib/jobs/preferred.ts) and the account page's boxes. Read once per request, and only when
// the request carries a session cookie (currentMember), so visitors who never signed in cost no
// query. If they cannot be read, the list shows what its address says, as for a visitor.

/** The slugs of the member's active preferred subfields; none when signed out. */
export const memberPreferredSubfields = cache(async (): Promise<string[]> => {
  try {
    const current = await currentMember()
    if (!current) return []
    const db = memberDb(await getPayload({ config }))
    return (await preferredSubfields(db, current.member.id)).map((subfield) => subfield.slug)
  } catch (error) {
    const reference = newReference()
    console.error(`Preferred subfields left out (reference ${reference}): ${errorSummary(error)}`)
    return []
  }
})
