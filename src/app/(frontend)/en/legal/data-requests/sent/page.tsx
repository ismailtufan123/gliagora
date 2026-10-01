import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DATA_REQUEST_PATHS } from '@/lib/data-requests/paths'
import { dataRequestPageIndexed } from '@/lib/indexing'

// After sending the data-request form (M4b, D49; the M4b design §5, §7.8): check your inbox. One
// neutral text, static and the same for every address, every kind of request and spam programs
// (the hidden field leads here too), so it says nothing about the request or the address. Never
// indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.sent' })
  return {
    title: t('metaTitle'),
    ...(dataRequestPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.sent' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <p>{t('text')}</p>
        <ul>
          <li>{t('confirm')}</li>
          <li>{t('validity')}</li>
          <li>{t('notConfirmed')}</li>
        </ul>
        <p>
          {t.rich('missing', {
            link: (chunks) => <a href={DATA_REQUEST_PATHS.form}>{chunks}</a>,
          })}
        </p>
      </div>
    </main>
  )
}
