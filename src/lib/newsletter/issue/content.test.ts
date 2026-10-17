import { describe, expect, it } from 'vitest'

import { withoutTracking } from '@/lib/jobs/url'
import type { JobCard } from '@/lib/jobs/view'

import { type ProposalCandidate, issueJob, proposeSelection, readSnapshot } from './content'
import { deadlineWindow, issueMonth, monthName, nextIssueDate } from './schedule'
import { SEED_ADDRESSES_MAX, seedAddresses } from './settings'

describe("an issue's date (D16)", () => {
  it('is by default the next first Tuesday at 13:00 UTC', () => {
    // 1 Nov 2026 is a Sunday: the first Tuesday is the 3rd.
    expect(nextIssueDate(new Date('2026-10-17T09:00:00Z')).toISOString()).toBe(
      '2026-11-03T13:00:00.000Z',
    )
    expect(nextIssueDate(new Date('2026-11-01T00:00:00Z')).toISOString()).toBe(
      '2026-11-03T13:00:00.000Z',
    )
    // On the day itself, until 13:00 UTC; then the next month's.
    expect(nextIssueDate(new Date('2026-11-03T12:59:59Z')).toISOString()).toBe(
      '2026-11-03T13:00:00.000Z',
    )
    expect(nextIssueDate(new Date('2026-11-03T13:00:00Z')).toISOString()).toBe(
      '2026-12-01T13:00:00.000Z',
    )
    // December to January; 1 Sep 2026 is a Tuesday itself.
    expect(nextIssueDate(new Date('2026-12-20T00:00:00Z')).toISOString()).toBe(
      '2027-01-05T13:00:00.000Z',
    )
    expect(nextIssueDate(new Date('2026-08-31T00:00:00Z')).toISOString()).toBe(
      '2026-09-01T13:00:00.000Z',
    )
  })

  it("names the issue by its date's month, in UTC", () => {
    expect(issueMonth(new Date('2026-11-03T13:00:00Z'))).toBe('2026-11')
    expect(issueMonth(new Date('2026-11-30T23:30:00Z'))).toBe('2026-11')
    expect(monthName('2026-11')).toBe('November 2026')
  })

  it('lists the deadlines of its day and the 45 days after it', () => {
    expect(deadlineWindow(new Date('2026-11-03T13:00:00Z'))).toEqual({
      from: '2026-11-03',
      to: '2026-12-18',
    })
  })
})

const card = (overrides: Partial<JobCard> = {}): JobCard => ({
  id: 7,
  shortId: 'k3f9a',
  path: '/en/jobs/phd-glia-k3f9a/',
  title: 'PhD in glial biology',
  originalLanguage: 'en',
  institution: {
    id: 1,
    name: 'Example University',
    path: '/en/institutions/x-0abcdefgh/',
    urlId: '0abcdefgh',
  },
  city: 'Lyon',
  country: 'France',
  positionType: { id: 3, slug: 'phd', label: 'PhD', isActive: true },
  subfields: [],
  methods: [],
  modelSystems: [],
  status: 'published',
  deadlineKind: 'fixed',
  deadlineDate: '2026-11-20T12:00:00.000Z',
  deadlineTz: 'Europe/Paris',
  deadlineAt: '2026-11-20T23:00:00.000Z',
  expiredAt: null,
  withdrawnAt: null,
  originalUrl: 'https://jobs.example.org/42?utm_source=board&lang=en#apply',
  ...overrides,
})

describe('a job in an issue', () => {
  it('keeps the public facts, with the employer link without tracking parameters', () => {
    expect(issueJob(card(), '  A summary.  ')).toEqual({
      id: 7,
      title: 'PhD in glial biology',
      path: '/en/jobs/phd-glia-k3f9a/',
      originalUrl: 'https://jobs.example.org/42?lang=en#apply',
      institution: 'Example University',
      place: 'Lyon, France',
      positionType: 'PhD',
      deadline: { kind: 'fixed', day: '2026-11-20', timeZone: 'Europe/Paris' },
      summary: 'A summary.',
    })
    expect(issueJob(card({ deadlineKind: 'rolling', deadlineDate: null }), null)?.deadline).toEqual(
      { kind: 'rolling' },
    )
    // A fixed deadline without a day never reaches an issue.
    expect(issueJob(card({ deadlineDate: null }), null)).toBeNull()
  })

  it('removes only tracking parameters from an employer link, keeping the rest as written', () => {
    expect(withoutTracking('https://a.org/j?id=1&utm_medium=x&fbclid=y')).toBe(
      'https://a.org/j?id=1',
    )
    expect(withoutTracking('https://a.org/j?b=2&a=1')).toBe('https://a.org/j?b=2&a=1')
    // Bare names, %20, and / or : in values stay byte for byte; a fragment stays.
    expect(
      withoutTracking(
        'https://a.org/j?jobId&utm_source=x&q=a%20b&next=/x:y&utm%5Fcampaign=z#apply',
      ),
    ).toBe('https://a.org/j?jobId&q=a%20b&next=/x:y#apply')
    expect(withoutTracking('https://a.org/j?utm_source=x')).toBe('https://a.org/j')
    expect(withoutTracking('mailto:x@example.org')).toBe('mailto:x@example.org')
  })

  it('reads back only a valid snapshot', () => {
    expect(readSnapshot(null)).toBeNull()
    expect(readSnapshot({ version: 2 })).toBeNull()
  })
})

describe('the proposed positions (PLAN §13: balanced by subfield and region)', () => {
  const c = (id: number, region: string | null, subfield: string | null): ProposalCandidate => ({
    id,
    region,
    subfield,
  })

  it('lets the regions take turns, the one with most candidates first', () => {
    const candidates = [
      c(1, 'europe', 'glia'),
      c(2, 'asia', 'motor'),
      c(3, 'europe', 'cognitive'),
      c(4, 'northern-america', 'sensory'),
      c(5, 'europe', 'glia'),
      c(6, 'asia', 'glia'),
    ]
    expect(proposeSelection(candidates, 4)).toEqual([1, 2, 4, 3])
  })

  it("prefers a subfield not chosen yet within a region's turn", () => {
    const candidates = [
      c(1, 'europe', 'glia'),
      c(2, 'asia', 'glia'),
      c(3, 'asia', 'motor'),
      c(4, 'europe', 'cognitive'),
    ]
    expect(proposeSelection(candidates, 2)).toEqual([1, 3])
  })

  it('takes what there is when there are fewer candidates than places', () => {
    expect(proposeSelection([c(1, null, null), c(2, null, 'glia')], 12)).toEqual([1, 2])
    expect(proposeSelection([], 12)).toEqual([])
  })
})

describe('the seed addresses of test emails', () => {
  it('reads addresses separated by commas or spaces, without repeats or bad entries', () => {
    const { addresses, problems } = seedAddresses({
      GLIA_NOTES_SEED_ADDRESSES: 'a@example.org, B@example.org b@example.org,not-an-address',
    })
    expect(addresses).toEqual(['a@example.org', 'b@example.org'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).not.toContain('not-an-address')
  })

  it(`keeps at most ${SEED_ADDRESSES_MAX}`, () => {
    const many = Array.from({ length: 12 }, (_, i) => `s${i}@example.org`).join(',')
    expect(seedAddresses({ GLIA_NOTES_SEED_ADDRESSES: many }).addresses).toHaveLength(
      SEED_ADDRESSES_MAX,
    )
    expect(seedAddresses({}).addresses).toEqual([])
  })
})
