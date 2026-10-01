import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DATA_REQUEST_PATHS } from '@/lib/data-requests/paths'
import { dataRequestPageIndexed } from '@/lib/indexing'
import { paths } from '@/lib/site'

// After any request other than a deletion is confirmed with the data-request form's link (M4b,
// D49; the M4b design §5, §7.8): it is recorded, and an editor answers it within 30 days of its
// receipt, by email. Static and the same for everyone. Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.received' })
  return {
    title: t('metaTitle'),
    ...(dataRequestPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.received' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <p>{t('text')}</p>
        <p>{t('answer')}</p>
        <p>{t('record')}</p>
        <p>
          {t.rich('more', {
            link: (chunks) => <a href={DATA_REQUEST_PATHS.page}>{chunks}</a>,
          })}
        </p>
        <ul>
          <li>
            <a href={paths.window('jobs')}>{t('jobs')}</a>
          </li>
          <li>
            <a href={paths.home()}>{t('home')}</a>
          </li>
        </ul>
      </div>
    </main>
  )
}
