import { getTranslations } from 'next-intl/server'

import type { Outcome } from '@/lib/members/outcome'
import { OUTCOME_ID } from '@/lib/members/paths'

// What a member page says after a redirect (M4b, D49; the M4b design §8): near the top of the main
// content, as `#outcome`. Redirects that carry an outcome end in `#outcome`, so the browser scrolls
// to the message and moves focus to it (it can take focus, `tabIndex={-1}`); `autofocus` would not
// work, since Chromium skips it when the address names a fragment. A success is a status message,
// an error an alert. The codes are allow-listed (src/lib/members/outcome.ts).

export async function OutcomeMessage({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null
  const t = await getTranslations({ locale: 'en', namespace: 'outcome' })
  const text =
    outcome.kind === 'done'
      ? t(`done.${outcome.code}`)
      : outcome.code === 'failed' && outcome.reference
        ? t('error.failedReference', { reference: outcome.reference })
        : t(`error.${outcome.code}`)
  return (
    <p
      id={OUTCOME_ID}
      role={outcome.kind === 'error' ? 'alert' : 'status'}
      tabIndex={-1}
      className={outcome.kind === 'error' ? 'outcome outcome-error' : 'outcome'}
    >
      {text}
    </p>
  )
}
