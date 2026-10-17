import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { newsletterArchiveIndexed } from '@/lib/indexing'
import { formatDay } from '@/lib/jobs/format'
import { sentIssues } from '@/lib/newsletter/issue/archive'
import { ARCHIVE_PATH, issuePath } from '@/lib/newsletter/issue/links'
import { monthName } from '@/lib/newsletter/issue/schedule'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { paths } from '@/lib/site'

// The archive of Glia Notes (M11, D53; PLAN §2.2): every sent issue, newest first, with a link to
// its page. Read per request (the build has no database). Indexed once it lists an issue; private
// until the launch, like the jobs (D39).
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter.archive' })
  const issues = await sentIssues()
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: ARCHIVE_PATH },
    ...(newsletterArchiveIndexed(issues.length) ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })
  const issues = await sentIssues()
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <Breadcrumbs
          locale="en"
          items={[
            { label: t('subfields.home'), href: paths.home() },
            { label: t('newsletter.title'), href: NEWSLETTER_PATHS.signup },
            { label: t('newsletter.archive.title') },
          ]}
        />
        <h1>{t('newsletter.archive.title')}</h1>
        {issues.length === 0 ? (
          <p>{t('newsletter.archive.empty')}</p>
        ) : (
          <>
            <p>{t('newsletter.archive.intro')}</p>
            <ul role="list">
              {issues.map((issue) => (
                <li key={issue.month}>
                  <a href={issuePath(issue.month)}>
                    {t('gliaNotes.issueTitle', { month: monthName(issue.month) })}
                  </a>
                  : {issue.subject}
                  {issue.sentAt && (
                    <span className="text-text-muted">
                      {' '}
                      ·{' '}
                      {t('newsletter.archive.sentOn', {
                        date: formatDay(issue.sentAt.slice(0, 10), 'en'),
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p>
          <a href={NEWSLETTER_PATHS.signup}>{t('newsletter.archive.subscribe')}</a>
        </p>
      </div>
    </main>
  )
}
