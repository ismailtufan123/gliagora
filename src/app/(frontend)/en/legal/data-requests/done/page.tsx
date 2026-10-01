import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DATA_REQUEST_PATHS } from '@/lib/data-requests/paths'
import { dataRequestPageIndexed } from '@/lib/indexing'
import { paths } from '@/lib/site'

// After a deletion confirmed with the data-request form's link (M4b, D49; the M4b design §5,
// §7.8): what was deleted, what stays, and that one email confirms it (sent by `sendRequestEmails`
// within minutes; the form works only with a mail server). Static and the same for everyone: what
// was found under the address is in that email only. Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.done' })
  return {
    title: t('metaTitle'),
    ...(dataRequestPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.done' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <p>{t('text')}</p>
        <ul>
          <li>{t('deleted.suggestions')}</li>
          <li>{t('deleted.account')}</li>
          <li>{t('deleted.reports')}</li>
          <li>{t('deleted.newsletter')}</li>
        </ul>
        <p>{t('email')}</p>
        <h2>{t('keptHeading')}</h2>
        <ul>
          <li>{t('kept.personalRights')}</li>
          <li>{t('kept.record')}</li>
          <li>{t('kept.backups')}</li>
        </ul>
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
