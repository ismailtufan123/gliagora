import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { newsletterPageIndexed } from '@/lib/indexing'
import { paths } from '@/lib/site'

// After a Glia Notes signup was confirmed (M2, D50; PLAN §9.10, D41): there is no issue before the
// public launch, so the page says so. Static, the same for everyone; never indexed. It links only
// to pages that are public at M2 (the home page, About).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.confirmed' })
  return {
    title: t('title'),
    ...(newsletterPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.confirmed' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <p>{t('text')}</p>
        <p>{t('welcome')}</p>
        <ul className="flex flex-wrap gap-4" role="list">
          <li>
            <a href={paths.home()} className="button button-primary">
              {t('home')}
            </a>
          </li>
          <li>
            <a href={paths.section('about')} className="button button-secondary">
              {t('about')}
            </a>
          </li>
        </ul>
      </div>
    </main>
  )
}
