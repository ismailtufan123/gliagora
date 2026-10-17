import type { Payload } from 'payload'

import { buildIssueContent, proposeSelectedJobs } from '@/lib/newsletter/issue/build'
import { SEND_HOUR_UTC } from '@/lib/newsletter/issue/schedule'

// A fake sent issue of Glia Notes (M11) for local development and the tests: `pnpm fake:jobs`
// replaces it, so the archive and an issue's page have something to show. It is dated the first
// Tuesday of the month before the run (a month no real draft holds: the launch issue is dated
// ahead), and its snapshot is built from the fake jobs as they are now. Fake data only.

export const FAKE_ISSUE_SUBJECT = 'Fake issue of Glia Notes for the tests'

/** The subject of the issues tests/e2e/newsletter-issues.spec.ts makes, which this removes too. */
export const E2E_ISSUE_SUBJECT = 'Glia Notes test issue'

/** The month of the fake issue for a run at `now`: the previous month, `YYYY-MM`. */
export function fakeIssueMonth(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7)
}

function firstTuesday(month: string): Date {
  const [year, m] = month.split('-').map(Number) as [number, number]
  const first = new Date(Date.UTC(year, m - 1, 1, SEND_HOUR_UTC))
  return new Date(first.getTime() + ((2 - first.getUTCDay() + 7) % 7) * 86_400_000)
}

/**
 * Removes the earlier fake issue and those of the end-to-end tests, and saves a new fake issue as
 * sent; returns its month.
 */
export async function replaceFakeIssue(payload: Payload, now: Date): Promise<string> {
  await payload.delete({
    collection: 'newsletter-issues',
    where: { subject: { in: [FAKE_ISSUE_SUBJECT, E2E_ISSUE_SUBJECT] } },
    overrideAccess: true,
    depth: 0,
  })
  const month = fakeIssueMonth(now)
  const sendAt = firstTuesday(month)
  // The lists as an issue dated now would show them (the fake jobs' deadlines lie ahead of now).
  const selected = await proposeSelectedJobs(payload, now, now)
  const { content } = await buildIssueContent(
    payload,
    {
      sendAt: now.toISOString(),
      subject: FAKE_ISSUE_SUBJECT,
      preheader: 'Deadlines and selected positions from the fake data.',
      intro:
        'This issue is made from the fake data of the tests.\n\nIt shows the deadlines and the selected positions an issue holds.',
      selected,
    },
    now,
  )
  await payload.create({
    collection: 'newsletter-issues',
    data: {
      sendAt: sendAt.toISOString(),
      subject: content.subject,
      preheader: content.preheader,
      intro: content.intro,
      selected,
      status: 'sent',
      sentAt: sendAt.toISOString(),
      pushedAt: sendAt.toISOString(),
      snapshot: { ...content, month, sendAt: sendAt.toISOString() },
    },
    overrideAccess: true,
    depth: 0,
  })
  return month
}
