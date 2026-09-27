// Fake review-queue data for local development and CI (D38): suggestions as the "Suggest a
// listing" form (M4.5) will create them, and candidates in every state of the queue. Generic
// notes, addresses and email addresses only on the reserved example.org and example.com domains,
// no real people. src/scripts/fake-queue.ts stores them after the fake jobs.

import type { RejectionReason, SubmissionKind } from '@/lib/review/status'

import { postingUrl } from './fake-jobs-data'
import { FIXED_JOBS } from './fake-jobs-fixed'

/**
 * Marks every fake suggestion (at the start of its note) and every candidate added by hand (at
 * the start of its source text), so the next run can remove them first.
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

/** The test institutions the fake queue refers to (ROR IDs). */
export const FAKE_QUEUE_INSTITUTIONS = [
  ...new Set(
    [...FAKE_SUBMISSIONS, ...FAKE_CANDIDATES].flatMap((item) => [
      ...('institutionRorId' in item && item.institutionRorId ? [item.institutionRorId] : []),
      ...(item.review ? [item.review.institutionRorId] : []),
    ]),
  ),
]
