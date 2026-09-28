import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { PRIVACY_EMAIL, paths } from '@/lib/site'

// Where "Suggest a listing" leads after sending (PLAN §3.2): what happens next. Static and not
// indexed; reaching it directly changes nothing. The hidden-field check sends spam programs here
// too, so it says nothing about the suggestion itself.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'suggest.sent' })
  return { title: t('metaTitle'), robots: { index: false } }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'suggest.sent' })
  const email = (chunks: ReactNode) => <a href={`mailto:${PRIVACY_EMAIL}`}>{chunks}</a>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <h2>{t('next')}</h2>
        <ol>
          <li>{t('check')}</li>
          <li>{t('publish')}</li>
          <li>{t('outcome')}</li>
        </ol>
        <p>{t.rich('changedMind', { email })}</p>
        <ul>
          <li>
            <a href={paths.section('suggest')}>{t('another')}</a>
          </li>
          <li>
            <a href={paths.window('jobs')}>{t('jobs')}</a>
          </li>
        </ul>
      </div>
    </main>
  )
}
