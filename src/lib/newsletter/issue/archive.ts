import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import { type IssueContent, readSnapshot } from './content'

// The archive of Glia Notes (M11, D53; PLAN §2.2, §13): the issues listmonk has sent, each from
// the snapshot it was sent with, so the page shows what the email said, even after its jobs
// changed or were deleted. Nothing about any subscriber. The proxy has already answered 404 for a
// month without a sent issue (src/lib/detail-routes.ts).

export type ArchivedIssue = { month: string; subject: string; sentAt: string | null }

/** The sent issues, newest first. */
export const sentIssues = cache(async (): Promise<ArchivedIssue[]> => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'newsletter-issues',
    where: { status: { equals: 'sent' } },
    select: { month: true, subject: true, sentAt: true },
    sort: '-sentAt',
    depth: 0,
    pagination: false,
  })
  return docs.flatMap((doc) =>
    doc.month ? [{ month: doc.month, subject: doc.subject, sentAt: doc.sentAt ?? null }] : [],
  )
})

/** The sent issue of `month` with its snapshot, or null. */
export const sentIssue = cache(
  async (month: string): Promise<(ArchivedIssue & { content: IssueContent }) | null> => {
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'newsletter-issues',
      where: { month: { equals: month }, status: { equals: 'sent' } },
      select: { month: true, subject: true, sentAt: true, snapshot: true },
      limit: 1,
      depth: 0,
      pagination: false,
    })
    const doc = docs[0]
    const content = readSnapshot(doc?.snapshot)
    return doc?.month && content
      ? { month: doc.month, subject: doc.subject, sentAt: doc.sentAt ?? null, content }
      : null
  },
)
