import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { newsletterPageIndexed } from '@/lib/indexing'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { paths } from '@/lib/site'

// After unsubscribing from Glia Notes (M2, D50; PLAN §13, §18.1): the address is deleted from the
// newsletter at once. Static, the same for everyone, also after a link with an unknown subscriber,
// a UUID that is not its subscriber's or listmonk's preview UUID, which changed nothing: so it says
// the address is deleted if it was on the list, and tells nobody whether it was. Never indexed. It
// links only to pages that are public at M2.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.unsubscribed' })
  return {
    title: t('title'),
    ...(newsletterPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.unsubscribed' })
  const again = (chunks: ReactNode) => <a href={NEWSLETTER_PATHS.signup}>{chunks}</a>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <p>{t('text')}</p>
        <p>{t('kept')}</p>
        <p>{t.rich('again', { link: again })}</p>
        <p>
          <a href={paths.home()}>{t('home')}</a>
        </p>
      </div>
    </main>
  )
}
