import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { memberPageIndexed } from '@/lib/indexing'
import { paths } from '@/lib/site'

// After "Delete my account" (M4b, D49; the M4b design §5, §7.6): the account is gone, and with it
// this browser's session. Static, and the same for everyone (it names nobody): what was deleted,
// what stays (the record of the request, the backups) and that an email may confirm it. It cannot
// promise that email: it is built without the server's settings, and the account may have had no
// address or the site no mail server (the confirmation page promises it only then). Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'account.deleted' })
  return {
    title: t('metaTitle'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'account.deleted' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <p>{t('text')}</p>
        <p>{t('kept')}</p>
        <p>{t('email')}</p>
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
