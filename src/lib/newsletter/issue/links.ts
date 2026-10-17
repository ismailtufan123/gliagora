import { CONTENT_PAGES } from '@/lib/content'
import { jobsHref } from '@/lib/filters/jobs'
import { paths } from '@/lib/site'

import { PREVIEW_UUID } from '../consent'
import { NEWSLETTER_PATHS } from '../paths'
import type { IssueContent } from './content'

// The links of an issue of Glia Notes (PLAN §13). Links to our own pages carry UTM tags, so the
// site's cookieless analytics (Umami, M2) can count the visits an issue brings; they never name
// the subscriber. Links to employers' pages are the postings' own addresses without any tracking
// parameters (`withoutTracking`, already applied in the content). The unsubscribe links are each
// subscriber's own (`?id=&s=`, M2): in the campaign listmonk fills them in for every subscriber
// (listmonk.ts in this folder); a preview or a test email carries listmonk's preview UUID, which
// belongs to nobody, so following it changes nothing.

/** The address of an issue in the archive (`/en/newsletter/2026-11/`). */
export const issuePath = (month: string) => `${NEWSLETTER_PATHS.signup}${month}/`

/** The archive's own page. */
export const ARCHIVE_PATH = `${NEWSLETTER_PATHS.signup}archive/`

/** An absolute link to a page of the site, with the issue's UTM tags. */
export function siteLink(origin: string, path: string, month: string): string {
  const url = new URL(path, origin)
  url.searchParams.set('utm_source', 'glia-notes')
  url.searchParams.set('utm_medium', 'email')
  url.searchParams.set('utm_campaign', `glia-notes-${month}`)
  return url.href
}

/** Who the unsubscribe links are for: placeholders that listmonk fills in, or nobody. */
export type Recipient =
  /** The campaign: listmonk writes each subscriber's ID and UUID where these stand. */
  | { kind: 'campaign'; id: string; uuid: string }
  /** A preview or a test email: listmonk's preview UUID, which unsubscribes nobody. */
  | { kind: 'preview' }

const recipientQuery = (recipient: Recipient) =>
  recipient.kind === 'campaign'
    ? `?id=${recipient.id}&s=${recipient.uuid}`
    : `?id=0&s=${encodeURIComponent(PREVIEW_UUID)}`

/** Every link an issue has, absolute, for one kind of recipient. */
export function issueLinks(content: IssueContent, origin: string, recipient: Recipient) {
  const own = (path: string) => siteLink(origin, path, content.month)
  return {
    online: own(issuePath(content.month)),
    job: (path: string) => own(path),
    moreDeadlines: own(
      jobsHref({ deadline: `${content.deadlines.from}..${content.deadlines.to}` }),
    ),
    jobs: own(paths.window('jobs')),
    map: own(paths.section('map')),
    // The pages about a person's own subscription and the legal texts carry no UTM tags.
    unsubscribe: `${origin}${NEWSLETTER_PATHS.unsubscribe}${recipientQuery(recipient)}`,
    oneClick: `${origin}${NEWSLETTER_PATHS.unsubscribeUse}${recipientQuery(recipient)}`,
    contact: `${origin}${CONTENT_PAGES.contact.path}`,
    privacy: `${origin}${CONTENT_PAGES.privacy.path}`,
    kvkk: `${origin}${CONTENT_PAGES.kvkk.path}`,
  }
}

export type IssueLinks = ReturnType<typeof issueLinks>
