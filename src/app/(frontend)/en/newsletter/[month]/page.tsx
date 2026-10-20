import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { IssueArticle } from '@/components/newsletter/IssueArticle'
import { NotFoundContent } from '@/components/NotFoundContent'
import { newsletterIssueIndexed } from '@/lib/indexing'
import { formatDay } from '@/lib/jobs/format'
import { sentIssue } from '@/lib/newsletter/issue/archive'
import { ARCHIVE_PATH, issuePath } from '@/lib/newsletter/issue/links'
import { monthName } from '@/lib/newsletter/issue/schedule'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { paths } from '@/lib/site'

// A sent issue of Glia Notes in its archive (M11, D53; PLAN §2.2, §13): the content it was sent
// with. The proxy has already answered 404 for a month without a sent issue
// (src/lib/detail-routes.ts). Indexed once public; private until the launch, like the jobs (D39).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ month: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { month } = await params
  const issue = await sentIssue(month)
  // Only an issue from the database names the page; never text from the URL.
  if (!issue) return { robots: { index: false } }
  const t = await getTranslations({ locale: 'en' })
  const name = monthName(issue.month)
  return {
    title: t('gliaNotes.issueTitle', { month: name }),
    description: t('newsletter.archive.issueDescription', { month: name }),
    alternates: { canonical: issuePath(issue.month) },
    ...(newsletterIssueIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ params }: Props) {
  const { month } = await params
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })
  const issue = await sentIssue(month)
  // Only if the issue disappeared after the proxy checked it; notFound() would render on the
  // client only (CLAUDE.md), so show the 404 content directly.
  if (!issue) return <NotFoundContent locale="en" kind="notFound" />
  const title = t('gliaNotes.issueTitle', { month: monthName(issue.month) })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <article className="prose">
        <Breadcrumbs
          locale="en"
          items={[
            { label: t('subfields.home'), href: paths.home() },
            { label: t('newsletter.archive.title'), href: ARCHIVE_PATH },
            { label: title },
          ]}
        />
        <h1>{title}</h1>
        {issue.sentAt && (
          <p className="text-text-muted">
            {t('newsletter.archive.sentOn', { date: formatDay(issue.sentAt.slice(0, 10), 'en') })}
          </p>
        )}
        <IssueArticle content={issue.content} />
        <ul role="list" className="flex list-none flex-wrap gap-x-6 gap-y-2 ps-0">
          <li>
            <a href={ARCHIVE_PATH}>{t('newsletter.archive.all')}</a>
          </li>
          <li>
            <a href={NEWSLETTER_PATHS.signup}>{t('newsletter.archive.subscribe')}</a>
          </li>
        </ul>
      </article>
    </main>
  )
}
