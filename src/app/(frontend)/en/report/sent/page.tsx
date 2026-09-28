import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { REPORT_LEGAL_LINKS } from '@/lib/forms/report'
import { REPORT_PATH } from '@/lib/reports/item'
import { paths } from '@/lib/site'

// Where "Report a problem" leads after sending (PLAN §7.5, "sent"): what happens next, for a
// personal-rights request and for other reports, with only the timelines the notice and
// takedown page promises. Static and not indexed; reaching it directly changes nothing. The
// hidden-field check sends spam programs here too, and the kind is not in the address, so it
// says nothing about the report itself.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'report.sent' })
  return { title: t('metaTitle'), robots: { index: false } }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'report.sent' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <h2>{t('next')}</h2>
        <h3>{t('personalRightsTitle')}</h3>
        <p>{t('personalRights')}</p>
        <h3>{t('otherTitle')}</h3>
        <p>{t('other')}</p>
        <p>
          {t.rich('takedown', {
            link: (chunks) => <a href={REPORT_LEGAL_LINKS.takedown}>{chunks}</a>,
          })}
        </p>
        <ul>
          <li>
            <a href={REPORT_PATH}>{t('another')}</a>
          </li>
          <li>
            <a href={paths.window('jobs')}>{t('jobs')}</a>
          </li>
        </ul>
      </div>
    </main>
  )
}
