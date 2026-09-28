'use server'

import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { altchaKey, newChallenge } from '@/lib/forms/altcha'
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
  const fieldErrors: SuggestState['fieldErrors'] = {}
  if (outcome.kind === 'invalid') {
    for (const [field, code] of Object.entries(outcome.errors)) {
      fieldErrors[field as keyof typeof fieldErrors] = t(code)
    }
  }
  return {
    values: outcome.values,
    fieldErrors,
    formError:
      outcome.kind === 'refused'
        ? t(outcome.problem)
        : outcome.kind === 'failed'
          ? t('failed', { reference: outcome.reference })
          : null,
    status: outcome.status,
    // A new challenge for the next attempt: an answer is used once, and may have expired.
    challenge: key ? await newChallenge(key) : null,
    // Without JavaScript, React posts the previous state with the form, so it is not trusted.
    attempt: (Number.isSafeInteger(previous?.attempt) ? previous.attempt : 0) + 1,
  }
}
