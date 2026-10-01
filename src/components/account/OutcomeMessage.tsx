import { getTranslations } from 'next-intl/server'

import type { Outcome } from '@/lib/members/outcome'
import { OUTCOME_ID } from '@/lib/members/paths'

// What a member page says after a redirect (M4b, D49; the M4b design §8): near the top of the main
// content, as `#outcome`. Redirects that carry an outcome end in `#outcome`, so the browser scrolls
// to the message and moves focus to it (it can take focus, `tabIndex={-1}`); `autofocus` would not
// work, since Chromium skips it when the address names a fragment. A success is a status message,
// an error an alert. The codes are allow-listed (src/lib/members/outcome.ts). After a change of
// sign-in methods that signed the account out elsewhere, a second sentence says so. `signedIn`:
// the page shows a member who is signed in, so an expired link left that sign-in as it was (and
// there is no form to ask for a new link).

export async function OutcomeMessage({
  outcome,
  signedIn = false,
}: {
  outcome: Outcome | null
  signedIn?: boolean
}) {
  if (!outcome) return null
  const t = await getTranslations({ locale: 'en', namespace: 'outcome' })
  const text =
    outcome.kind === 'done'
      ? t(`done.${outcome.code}`)
      : outcome.code === 'failed' && outcome.reference
        ? t('error.failedReference', { reference: outcome.reference })
        : outcome.code === 'link-expired' && signedIn
          ? t('error.linkExpiredSignedIn')
          : t(`error.${outcome.code}`)
  const message =
    outcome.kind === 'done' && outcome.othersEnded ? `${text} ${t('done.othersEnded')}` : text
  return (
    <p
      id={OUTCOME_ID}
      role={outcome.kind === 'error' ? 'alert' : 'status'}
      tabIndex={-1}
      className={outcome.kind === 'error' ? 'outcome outcome-error' : 'outcome'}
    >
      {message}
    </p>
  )
}
