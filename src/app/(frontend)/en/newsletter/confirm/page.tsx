import config from '@payload-config'
import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import { type ReactNode, cache } from 'react'

import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { newsletterPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { findEmailToken, memberDb } from '@/lib/members/store'
import { isToken } from '@/lib/members/tokens'
import { pendingSignup } from '@/lib/newsletter/confirm'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { requestTime } from '@/lib/records'
import { NEWSLETTER_LINK_DAYS } from '@/lib/retention/rules'

// Where the Glia Notes confirmation link leads (M2, D50; PLAN §9.10, §13). Opening it only looks
// the link up: mail scanners and link previews may open it any number of times, and nothing is
// done until the person presses the button, which posts to /en/newsletter/confirm/use/. The page
// names the address. A link that is unknown, used, expired or made for something else has its own
// message. After a failure (`?error=failed&ref=`, or `unavailable`) the message comes first and the
// button stays: nothing changed. Never indexed; the document's title is the heading of the state
// shown (WCAG 2.4.2).
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** The `token` of the address as one string, so the lookup's cache has one key per request. */
const tokenOf = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '')

type Landing = { state: 'expired' } | { state: 'ready'; token: string; email: string }

const landing = cache(async (token: string): Promise<Landing> => {
  if (!isToken(token)) return { state: 'expired' }
  const db = memberDb(await getPayload({ config }))
  const link = await findEmailToken(db, token, requestTime())
  // A sign-in link, a link to add an address or one to confirm a data request has its own page.
  if (!link || !pendingSignup(link)) return { state: 'expired' }
  return { state: 'ready', token, email: link.email }
})

const titleOf = (found: Landing) => (found.state === 'expired' ? 'expiredTitle' : 'title')

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.confirm' })
  let title: string
  try {
    title = t(titleOf(await landing(tokenOf((await searchParams).token))))
  } catch (error) {
    unstable_rethrow(error)
    // The page shows MemberUnavailable, under this heading, and logs the error.
    title = t('title')
  }
  return { title, ...(newsletterPageIndexed() ? {} : { robots: { index: false } }) }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.confirm' })
  const params = await searchParams
  let found: Landing
  try {
    found = await landing(tokenOf(params.token))
  } catch (error) {
    unstable_rethrow(error)
    return (
      <MemberUnavailable title={t('title')} name="Newsletter confirmation page" error={error} />
    )
  }

  if (found.state === 'expired') {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t(titleOf(found))}</h1>
          <p>{t('expired', { days: NEWSLETTER_LINK_DAYS })}</p>
          <p>{t('expiredUsed')}</p>
          <p>
            <a href={NEWSLETTER_PATHS.signup} className="button button-primary">
              {t('again')}
            </a>
          </p>
        </div>
      </main>
    )
  }

  // An address can be long, with no place to break: it may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t(titleOf(found))}</h1>
        <OutcomeMessage
          outcome={readOutcome(params, { error: ['failed', 'unavailable'] })}
          failed="subscribeFailed"
        />
        <p>{t.rich('address', { email: found.email, strong })}</p>
        <p>{t('what')}</p>
        <p>{t('notYou')}</p>
        <form method="post" action={NEWSLETTER_PATHS.confirmUse}>
          <input type="hidden" name="token" value={found.token} />
          <button type="submit" className="button button-primary">
            {t('button')}
          </button>
        </form>
      </div>
    </main>
  )
}
