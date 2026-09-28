'use server'

import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { altchaKey } from '@/lib/forms/altcha'
import { stateAfter } from '@/lib/forms/public-form'
import { postgresLimitStore } from '@/lib/forms/rate-limit'
import { SUGGEST_SENT_PATH, type SuggestState, handleSuggestion } from '@/lib/forms/suggest'

// The Server Action behind the "Suggest a listing" form (src/lib/forms/suggest.ts does the work).
// With JavaScript the form calls it through React; without, the browser posts the form and
// Next.js renders the page again with the state this returns.

export async function sendSuggestion(
  previous: SuggestState,
  form: FormData,
): Promise<SuggestState> {
  const key = altchaKey()
  const outcome = await handleSuggestion(form, {
    altchaKey: key,
    secret: process.env.PAYLOAD_SECRET ?? '',
    headers: await headers(),
    now: new Date(),
    limits: async () => postgresLimitStore(await getPayload({ config })),
    // Suggestions are created only here, through the local API: `create` is refused to everyone
    // else (src/collections/Submissions.ts). A suggested position becomes a candidate in the
    // same transaction.
    save: async (data) => {
      const payload = await getPayload({ config })
      await payload.create({
        collection: 'submissions',
        data: { ...data, status: 'new' },
        overrideAccess: true,
        depth: 0,
      })
    },
  })
  // Also when the hidden field was filled in: the same answer as for a real suggestion.
  if (outcome.kind === 'sent') {
    // Back from the sent page would otherwise show the form from the browser's router cache, with
    // the challenge just used, so the next suggestion would fail the spam check. refresh() tells
    // the router to drop that cache (a response header; without JavaScript it changes nothing).
    refresh()
    redirect(SUGGEST_SENT_PATH)
  }

  const t = await getTranslations({ locale: 'en', namespace: 'suggest.errors' })
  return stateAfter(outcome, previous, (code, values) => t(code as never, values as never), key)
}
