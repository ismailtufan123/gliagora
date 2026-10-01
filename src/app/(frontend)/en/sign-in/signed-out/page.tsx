import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { memberPageIndexed } from '@/lib/indexing'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { paths } from '@/lib/site'

// After signing out (M4b, D49; the M4b design §5), in this browser or everywhere. Static: the
// sign-out route has already ended the session and deleted the cookie. Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.signedOut' })
  return {
    title: t('metaTitle'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.signedOut' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <p>{t('text')}</p>
        <ul>
          <li>
            <a href={MEMBER_PATHS.signIn}>{t('again')}</a>
          </li>
          <li>
            <a href={paths.window('jobs')}>{t('jobs')}</a>
          </li>
        </ul>
      </div>
    </main>
  )
}
