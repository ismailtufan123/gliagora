import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { newsletterPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { PREVIEW_UUID, unsubscribeLink } from '@/lib/newsletter/consent'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { CONTACT_EMAIL } from '@/lib/site'

// The page the unsubscribe link in every Glia Notes email opens (M2, D50; PLAN §13; `?id=`
// listmonk's subscriber ID, `?s=` its UUID). Opening it changes nothing and asks listmonk nothing (mail
// scanners open links): one button posts to /en/newsletter/unsubscribe/use/, which unsubscribes at
// once and deletes the address. Works without JavaScript and without signing in. A link without a
// usable ID and UUID (cut short, or changed) shows no button but says the link is incomplete, which
// anyone can see from the address itself; listmonk's preview UUID shows the button, which then
// changes nothing. After a failure (`?error=failed&ref=`, or `unavailable`) the message comes
// first and the button stays. Rendered for each request (its query); never indexed.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.unsubscribe' })
  return {
    title: t('title'),
    ...(newsletterPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.unsubscribe' })
  const params = await searchParams
  const link = unsubscribeLink(params.id, params.s)
  const email = (chunks: ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        {link === null ? (
          <p className="notice">{t.rich('incomplete', { email })}</p>
        ) : (
          <>
            <OutcomeMessage
              outcome={readOutcome(params, { error: ['failed', 'unavailable'] })}
              failed="unsubscribeFailed"
            />
            <p>{t('text')}</p>
            <p>{t('kept')}</p>
            <form method="post" action={NEWSLETTER_PATHS.unsubscribeUse}>
              <input type="hidden" name="id" value={link === 'preview' ? '' : String(link.id)} />
              <input type="hidden" name="s" value={link === 'preview' ? PREVIEW_UUID : link.uuid} />
              <button type="submit" className="button button-primary">
                {t('button')}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
