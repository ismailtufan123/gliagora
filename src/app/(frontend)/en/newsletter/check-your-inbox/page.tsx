import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { newsletterPageIndexed } from '@/lib/indexing'
import { NEWSLETTER_COOKIE } from '@/lib/members/cookies'
import { readOutcome } from '@/lib/members/outcome'
import { maskEmail, openInbox } from '@/lib/newsletter/cookie'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { requestTime } from '@/lib/records'
import { NEWSLETTER_LINK_DAYS } from '@/lib/retention/rules'

// "Check your inbox" after the Glia Notes signup (M2, D50; PLAN §9.10). With the sealed cookie the
// form set (src/lib/newsletter/cookie.ts, an hour from the form): the address the link went to,
// masked (`a•••@example.org`), how long the link works, and "Send it again", a POST to
// /en/newsletter/resend/, which the server allows once a minute (src/lib/newsletter/resend.ts), and
// "Wrong address? Go back". Without the cookie (later, another browser, the hidden field): the same
// page without the address or the button. Rendered for each request (the cookie); never indexed.
// Works without JavaScript.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.inbox' })
  return {
    title: t('title'),
    ...(newsletterPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.inbox' })
  const inbox = openInbox(
    (await cookies()).get(NEWSLETTER_COOKIE)?.value,
    process.env.PAYLOAD_SECRET ?? '',
    requestTime(),
  )
  // An address can be long, with no place to break: it may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>
  const back = (chunks: ReactNode) => <a href={NEWSLETTER_PATHS.signup}>{chunks}</a>
  const days = NEWSLETTER_LINK_DAYS
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <OutcomeMessage
          outcome={readOutcome(await searchParams, {
            done: ['resent'],
            error: ['wait', 'limited', 'unavailable', 'failed'],
          })}
          failed="resendFailed"
        />
        {inbox ? (
          <>
            <p>{t.rich('sent', { email: maskEmail(inbox.email), strong, days })}</p>
            <p>{t('confirm')}</p>
            <p>{t('missing')}</p>
            <form method="post" action={NEWSLETTER_PATHS.resend}>
              <button type="submit" className="button button-secondary">
                {t('again')}
              </button>
            </form>
            <p>{t.rich('wrongAddress', { link: back })}</p>
          </>
        ) : (
          <>
            <p>{t('general', { days })}</p>
            <p>{t('confirm')}</p>
            <p>{t.rich('generalMissing', { link: back })}</p>
          </>
        )}
      </div>
    </main>
  )
}
