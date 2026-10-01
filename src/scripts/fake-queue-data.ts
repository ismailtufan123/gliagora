// Fake review-queue data for local development and CI (D38): suggestions as the "Suggest a
// listing" form (M4.5) will create them, and candidates in every state of the queue. Generic
// notes, addresses and email addresses only on the reserved example.org and example.com domains,
// no real people. src/scripts/fake-queue.ts stores them after the fake jobs.

import type { DataRequestKind, DataRequestSource } from '@/lib/data-requests/kinds'
import type { DataRequestAction, DataRequestStatus } from '@/lib/data-requests/status'
import type { ReportAction, ReportKind, ReportStatus } from '@/lib/reports/status'
import type { RejectionReason, SubmissionKind } from '@/lib/review/status'

import { postingUrl } from './fake-jobs-data'
import { FIXED_JOBS } from './fake-jobs-fixed'

/**
 * Marks every fake suggestion (at the start of its note), every candidate added by hand (at the
 * start of its source text) and every fake report (at the start of its details), so the next run
 * can remove them first. The end-to-end tests start what they send with it too.
 */
export const FAKE_QUEUE_NOTE = 'Fake data (pnpm fake:jobs).'

/** What an editor did with a candidate: triaged it, then perhaps decided. */
export type FakeReview = {
  status: 'triaged' | 'accepted' | 'rejected' | 'duplicate'
  rawTitle: string
  institutionRorId: string
  decisionReason?: RejectionReason
  decisionNote?: string
  /** The short ID of the fake job it repeats. */
  duplicateOf?: string
}

/** A suggestion from the form. */
export type FakeSubmission = {
  url: string
  kind: SubmissionKind
  note: string
  email: string | null
  consentToContact: boolean
  locale: 'en' | 'tr'
  /** A position: what an editor did with its candidate. */
  review?: FakeReview
  /** Another kind: whether an editor handled it by hand and set it to Decided. */
  decided?: boolean
}

/** A candidate an editor added by hand. */
export type FakeCandidate = {
  rawUrl: string
  rawTitle: string
  institutionRorId?: string
  snippet: string
  review?: FakeReview
}

const note = (text: string) => `${FAKE_QUEUE_NOTE} ${text}`

const { open, closingSoon } = FIXED_JOBS

export const FAKE_SUBMISSIONS: FakeSubmission[] = [
  {
    url: postingUrl('03g001n57', 'sug01'),
    kind: 'position',
    note: note('Seen in a society newsletter.'),
    email: null,
    consentToContact: false,
    locale: 'en',
  },
  {
    // An address given without ticking the consent box: the collection drops it.
    url: postingUrl('04kwvgz42', 'sug02'),
    kind: 'position',
    note: note('Üniversitenin kendi ilan sayfası.'),
    email: 'suggester-2@example.org',
    consentToContact: false,
    locale: 'tr',
  },
  {
    url: postingUrl('053sba816', 'sug03'),
    kind: 'position',
    note: note("Posted on the institute's careers page."),
    email: 'suggester-3@example.org',
    consentToContact: true,
    locale: 'en',
    review: {
      status: 'triaged',
      rawTitle: 'PhD position in cerebellar motor learning',
      institutionRorId: '053sba816',
    },
  },
  {
    url: `${postingUrl('02jx3x895', 'sug04')}?utm_source=newsletter`,
    kind: 'position',
    note: note('The deadline is at the end of next month.'),
    email: 'suggester-4@example.com',
    consentToContact: true,
    locale: 'en',
    review: {
      status: 'accepted',
      rawTitle: 'Postdoctoral researcher in glial metabolism',
      institutionRorId: '02jx3x895',
    },
  },
  {
    url: 'https://jobs.example.com/listings/48213',
    kind: 'position',
    note: note('Found on a job board.'),
    email: null,
    consentToContact: false,
    locale: 'en',
    review: {
      status: 'rejected',
      rawTitle: 'Research fellow in auditory neuroscience',
      institutionRorId: '013sk6x84',
      decisionReason: 'not-employer-page',
      decisionNote: "A job board listing; the employer's own page could not be found.",
    },
  },
  {
    url: 'https://events.example.org/summer-school-neural-data',
    kind: 'event',
    note: note('A summer school on neural data analysis.'),
    email: null,
    consentToContact: false,
    locale: 'en',
  },
  {
    url: 'https://funding.example.org/travel-grants',
    kind: 'funding',
    note: note('Travel grants for early-career researchers.'),
    email: 'suggester-7@example.com',
    consentToContact: true,
    locale: 'en',
    decided: true,
  },
]

export const FAKE_CANDIDATES: FakeCandidate[] = [
  {
    rawUrl: postingUrl('00zdnkx70', 'man01'),
    rawTitle: 'Research assistant in zebrafish behaviour',
    snippet: note(
      'From a mailing list: a research assistant position in a zebrafish behaviour group; details on the institute page.',
    ),
  },
  {
    // Nearly the title of a fixed job at the same institution: listed as a possible duplicate.
    rawUrl: postingUrl(open.institutionRorId, 'man02'),
    rawTitle: 'PhD position in astrocyte-neuron signaling',
    institutionRorId: open.institutionRorId,
    snippet: note('From a mailing list: a doctoral position on astrocytes.'),
    review: {
      status: 'triaged',
      rawTitle: 'PhD position in astrocyte-neuron signaling',
      institutionRorId: open.institutionRorId,
    },
  },
  {
    // The address of a fixed job with a tracking parameter: the same canonical address.
    rawUrl: `${postingUrl(closingSoon.institutionRorId, closingSoon.shortId)}?utm_campaign=list`,
    rawTitle: closingSoon.title,
    snippet: note('From a society job board, linking to the employer page.'),
    review: {
      status: 'duplicate',
      rawTitle: closingSoon.title,
      institutionRorId: closingSoon.institutionRorId,
      duplicateOf: closingSoon.shortId,
    },
  },
  {
    rawUrl: 'https://recruiting.example.com/roles/7731',
    rawTitle: 'Senior research scientist, neuroscience',
    snippet: note('From a recruiter newsletter.'),
    review: {
      status: 'rejected',
      rawTitle: 'Senior research scientist, neuroscience',
      institutionRorId: '03m6ee736',
      decisionReason: 'agency-or-intermediary',
      decisionNote: 'Placed by a recruitment agency, not by the employer.',
    },
  },
]

/** A report from "Report a problem" (M4.6), and how far an editor has handled it. */
export type FakeReport = {
  kind: ReportKind
  details: string
  email: string | null
  /** The fixed job it is about (its short ID), if any. */
  job?: string
  /** Or the test institution it is about (its ROR ID). */
  institution?: string
  status: ReportStatus
  action?: ReportAction
  actionNote?: string
}

const { rolling, expiredRecently } = FIXED_JOBS

export const FAKE_REPORTS: FakeReport[] = [
  {
    kind: 'wrong-fact',
    details: note('The deadline on the original posting is two weeks later.'),
    email: null,
    job: open.shortId,
    status: 'new',
  },
  {
    kind: 'personal-rights',
    details: note('My name is listed as the contact person, but I have left the lab.'),
    email: 'reporter@example.org',
    job: closingSoon.shortId,
    status: 'new',
  },
  {
    kind: 'broken-link',
    details: note('The link to the posting leads to an error page.'),
    email: 'reader@example.com',
    job: rolling.shortId,
    status: 'in-progress',
    actionNote: 'Asked the employer for the new address.',
  },
  {
    kind: 'closed',
    details: note('The position was filled last week.'),
    email: null,
    job: expiredRecently.shortId,
    status: 'closed',
    action: 'corrected',
    actionNote: 'Marked as expired after checking the original posting.',
  },
  {
    kind: 'other',
    details: note('A general question about the site, not about an item.'),
    email: null,
    status: 'closed',
    action: 'not-applicable',
  },
  {
    // From an institution page (D40): the institution of the "institution" template of the
    // end-to-end tests (tests/e2e/pages.ts).
    kind: 'wrong-fact',
    details: note('A name the institution also uses is missing from its page.'),
    email: 'reader@example.org',
    institution: '05dxps055',
    status: 'new',
  },
]

/**
 * A data request (M4b, D49), as the form, the account settings or an editor recorded it, and how
 * far it has been handled. Every one is marked by its action note (the editors' own field), so the
 * next run finds them, also the unconfirmed ones, which hold no address or text of their own.
 */
export type FakeDataRequest = {
  kind: DataRequestKind
  source: DataRequestSource
  status: DataRequestStatus
  /**
   * The address it came from. A request from the form keeps only its hash until it is confirmed;
   * an account deleted without an address has none.
   */
  email: string | null
  name?: string
  details?: string
  locale: 'en' | 'tr'
  action?: DataRequestAction
  /** How many days ago it arrived. */
  receivedDaysAgo: number
}

export const FAKE_DATA_REQUESTS: FakeDataRequest[] = [
  {
    // Sent from the form, its link not opened yet: kind, date and the address hash only.
    kind: 'deletion',
    source: 'form',
    status: 'unconfirmed',
    email: 'requester-1@example.org',
    locale: 'en',
    receivedDaysAgo: 1,
  },
  {
    kind: 'access',
    source: 'form',
    status: 'new',
    email: 'requester-2@example.org',
    name: 'A. Requester',
    details: 'Please send me a copy of the data you hold about me.',
    locale: 'en',
    receivedDaysAgo: 3,
  },
  {
    // Arrived by email to privacy@ and recorded by an editor.
    kind: 'correction',
    source: 'email',
    status: 'in-progress',
    email: 'requester-3@example.com',
    details: 'The address on a report I sent has a typing mistake.',
    locale: 'tr',
    receivedDaysAgo: 12,
  },
  {
    // Confirmed with the link: the site deleted the data itself.
    kind: 'deletion',
    source: 'form',
    status: 'closed',
    email: 'requester-4@example.org',
    locale: 'en',
    action: 'deleted-automatically',
    receivedDaysAgo: 20,
  },
  {
    // "Delete my account" of a member who had no address (ORCID only).
    kind: 'deletion',
    source: 'account',
    status: 'closed',
    email: null,
    locale: 'en',
    action: 'deleted-automatically',
    receivedDaysAgo: 6,
  },
  {
    kind: 'objection',
    source: 'email',
    status: 'closed',
    email: 'requester-6@example.com',
    details: 'I object to being contacted about my suggestion.',
    locale: 'en',
    action: 'answered',
    receivedDaysAgo: 40,
  },
]

/** The test institutions the fake queue refers to (ROR IDs). */
export const FAKE_QUEUE_INSTITUTIONS = [
  ...new Set([
    ...[...FAKE_SUBMISSIONS, ...FAKE_CANDIDATES].flatMap((item) => [
      ...('institutionRorId' in item && item.institutionRorId ? [item.institutionRorId] : []),
      ...(item.review ? [item.review.institutionRorId] : []),
    ]),
    ...FAKE_REPORTS.flatMap((report) => (report.institution ? [report.institution] : [])),
  ]),
]
