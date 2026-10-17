import { CONTACT_EMAIL } from '@/lib/site'

import type { IssueContent, IssueJob } from './content'
import type { IssueLinks } from './links'
import { type IssueText, dayText, deadlineText, jobFacts, jobPlace, paragraphsOf } from './words'

// The plain-text part of an issue of Glia Notes (PLAN §13), made from the same content and links
// as its HTML (email.tsx), in the same order: readable in any mail program and by screen readers
// that are given the text part. No line wrapping: mail programs wrap it themselves.

const RULE = '-'.repeat(40)

const lines = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((part): part is string => typeof part === 'string' && part !== '').join('\n')

function deadlineRow(job: IssueJob, t: IssueText, links: IssueLinks) {
  return lines(deadlineText(job, t), job.title, jobPlace(job), links.job(job.path))
}

function selectedJob(job: IssueJob, t: IssueText, links: IssueLinks) {
  return lines(
    job.title,
    jobPlace(job),
    jobFacts(job, t),
    job.summary,
    links.job(job.path),
    job.originalUrl && `${t('job.original')} ${t('job.originalHint')}: ${job.originalUrl}`,
  )
}

export function issuePlainText(
  content: IssueContent,
  links: IssueLinks,
  t: IssueText,
  month: string,
  testNote?: string,
): string {
  const { deadlines, selected } = content
  const blocks = [
    testNote,
    lines(t('issueTitle', { month }), t('subtitle'), `${t('readOnline')}: ${links.online}`),
    ...paragraphsOf(content.intro),
    RULE,
    lines(
      t('deadlines.heading').toUpperCase(),
      t('deadlines.intro', { from: dayText(deadlines.from), to: dayText(deadlines.to) }),
    ),
    ...(deadlines.jobs.length === 0
      ? [t('deadlines.none')]
      : deadlines.jobs.map((job) => deadlineRow(job, t, links))),
    deadlines.more > 0 &&
      `${t('deadlines.more', { count: deadlines.more })}: ${links.moreDeadlines}`,
    RULE,
    lines(
      t('selected.heading').toUpperCase(),
      selected.length > 0 ? t('selected.intro') : t('selected.none'),
    ),
    ...selected.map((job) => selectedJob(job, t, links)),
    RULE,
    lines(
      t('more.heading').toUpperCase(),
      `${t('more.jobs')}: ${links.jobs}`,
      `${t('more.map')}: ${links.map}`,
      t('more.suggest', { email: CONTACT_EMAIL }),
    ),
    RULE,
    t('footer.why'),
    lines(t('footer.unsubscribeText'), links.unsubscribe),
    lines(
      `${t('footer.contact')}: ${links.contact}`,
      `${t('footer.privacy')}: ${links.privacy}`,
      `${t('footer.kvkk')}: ${links.kvkk}`,
    ),
    t('footer.sender', { email: CONTACT_EMAIL }),
  ]
  return `${blocks.filter((block): block is string => typeof block === 'string' && block !== '').join('\n\n')}\n`
}
