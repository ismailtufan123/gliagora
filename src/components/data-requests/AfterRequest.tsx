import { getTranslations, setRequestLocale } from 'next-intl/server'

import { DATA_REQUEST_PATHS } from '@/lib/data-requests/paths'
import type { SiteStage } from '@/lib/site-stage'
import { paths } from '@/lib/site'

// The pages after a request from the data-request form is confirmed with its emailed link (M4b,
// D49; the M4b design §5, §7.8). Static and the same for everyone. Each ends with ways on: the
// positions and the home page; in the M2 state (`stage="m2"`, D41, D50) only the home page, since
// the positions stay private until the launch (D39).

/**
 * After a confirmed deletion: what was deleted, what stays, and that one email confirms it (sent
 * by `sendRequestEmails` within minutes; the form works only with a mail server). What was found
 * under the address is in that email only.
 */
export async function DeletionDone({ stage = 'private' }: { stage?: SiteStage }) {
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
          {stage !== 'm2' && (
            <li>
              <a href={paths.window('jobs')}>{t('jobs')}</a>
            </li>
          )}
          <li>
            <a href={paths.home()}>{t('home')}</a>
          </li>
        </ul>
      </div>
    </main>
  )
}

/**
 * After any other request is confirmed: it is recorded, and an editor answers it within 30 days
 * of its receipt, by email.
 */
export async function RequestReceived({ stage = 'private' }: { stage?: SiteStage }) {
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
          {stage !== 'm2' && (
            <li>
              <a href={paths.window('jobs')}>{t('jobs')}</a>
            </li>
          )}
          <li>
            <a href={paths.home()}>{t('home')}</a>
          </li>
        </ul>
      </div>
    </main>
  )
}
