import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EXPORT_SCHEMA,
  type ExportData,
  exportDocument,
  exportFileName,
  handleExport,
} from './export'
import type { MemberRecord, SavedJobExportRow } from './store'

// "Download my data" (src/lib/members/export.ts): the file's shape, and the route's answers. The
// database is replaced by fakes; tests/e2e/account.spec.ts downloads a real export.

const NOW = new Date('2026-10-01T09:00:00.000Z')
const DAY = 86_400_000

const member = (changes: Partial<MemberRecord> = {}): MemberRecord => ({
  id: 7,
  email: 'member@example.org',
  emailVerifiedAt: new Date('2026-09-30T10:00:00Z'),
  emailVerifiedBy: 'link',
  googleId: '104857600000000000001',
  orcidId: null,
  displayName: 'Fake Member',
  digestOptIn: true,
  digestChangedAt: new Date('2026-09-30T11:00:00Z'),
  digestConsentVersion: '2026-09-27',
  lastSeenAt: new Date('2026-10-01T08:00:00Z'),
  deletionWarnedAt: null,
  warningRefusedAt: null,
  createdAt: new Date('2026-09-30T10:00:00Z'),
  ...changes,
})

const saved = (changes: Partial<SavedJobExportRow> = {}): SavedJobExportRow => ({
  jobId: 3,
  savedAt: new Date('2026-09-30T12:00:00Z'),
  title: 'PhD position in glial biology',
  slug: 'phd-position-in-glial-biology',
  shortId: 'k3f9a',
  status: 'published',
  deadlineKind: 'fixed',
  deadlineAt: new Date(NOW.getTime() + 20 * DAY),
  expiredAt: null,
  withdrawnAt: null,
  ...changes,
})

const data = (changes: Partial<ExportData> = {}): ExportData => ({
  member: member(),
  subfields: [
    { slug: 'glia', label: 'Glial biology', active: true },
    { slug: 'retired-one', label: 'Retired subfield', active: false },
  ],
  saved: [
    saved(),
    saved({
      jobId: 4,
      title: 'Withdrawn postdoc',
      shortId: 'm7p2q',
      slug: 'withdrawn-postdoc',
      status: 'withdrawn',
      withdrawnAt: new Date(NOW.getTime() - DAY),
    }),
  ],
  sessions: [new Date('2026-10-30T10:00:00Z'), new Date('2026-10-31T08:00:00Z')],
  underAddress: {
    suggestions: [
      {
        link: 'https://www.example.org/jobs/1',
        kind: 'position',
        note: 'Fake note.',
        sentAt: new Date('2026-09-01T10:00:00Z'),
        status: 'decided',
      },
    ],
    reports: [
      {
        kind: 'wrong-fact',
        page: '/en/jobs/phd-position-in-glial-biology-k3f9a/',
        details: 'Fake details.',
        sentAt: new Date('2026-09-02T10:00:00Z'),
        status: 'new',
      },
    ],
    dataRequests: [
      {
        kind: 'access',
        receivedAt: new Date('2026-09-03T10:00:00Z'),
        status: 'closed',
        closedAt: new Date('2026-09-10T10:00:00Z'),
      },
    ],
  },
  ...changes,
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportDocument', () => {
  it('holds the account, Glia Notes, subfields, saved positions, sessions and the records under the address', () => {
    const document = exportDocument(data(), NOW)
    expect(Object.keys(document)).toEqual([
      'schema',
      'exportedAt',
      'account',
      'gliaNotes',
      'preferredSubfields',
      'savedPositions',
      'sessions',
      'suggestions',
      'reports',
      'dataRequests',
    ])
    expect(document.schema).toBe(EXPORT_SCHEMA)
    expect(document.schema).toBe('gliagora-export/1')
    expect(document.exportedAt).toBe('2026-10-01T09:00:00.000Z')
    expect(document.account).toEqual({
      email: 'member@example.org',
      emailVerifiedAt: '2026-09-30T10:00:00.000Z',
      emailVerifiedBy: 'link',
      googleAccountId: '104857600000000000001',
      orcidId: null,
      displayName: 'Fake Member',
      joinedAt: '2026-09-30T10:00:00.000Z',
      lastActiveAt: '2026-10-01T08:00:00.000Z',
      inactivityWarningAt: null,
      inactivityWarningRefusedAt: null,
    })
    expect(document.gliaNotes).toEqual({
      on: true,
      changedAt: '2026-09-30T11:00:00.000Z',
      consentVersion: '2026-09-27',
    })
    expect(document.preferredSubfields).toEqual([
      { slug: 'glia', label: 'Glial biology', active: true },
      { slug: 'retired-one', label: 'Retired subfield', active: false },
    ])
    expect(document.savedPositions).toEqual([
      {
        title: 'PhD position in glial biology',
        url: 'https://gliagora.com/en/jobs/phd-position-in-glial-biology-k3f9a/',
        savedAt: '2026-09-30T12:00:00.000Z',
        state: 'open',
      },
      {
        title: 'Withdrawn postdoc',
        url: 'https://gliagora.com/en/jobs/withdrawn-postdoc-m7p2q/',
        savedAt: '2026-09-30T12:00:00.000Z',
        state: 'gone',
      },
    ])
    expect(document.sessions).toEqual({
      count: 2,
      expiresAt: ['2026-10-30T10:00:00.000Z', '2026-10-31T08:00:00.000Z'],
    })
    expect(document.suggestions).toEqual([
      {
        link: 'https://www.example.org/jobs/1',
        kind: 'position',
        note: 'Fake note.',
        sentAt: '2026-09-01T10:00:00.000Z',
        status: 'decided',
      },
    ])
    expect(document.reports).toEqual([
      {
        kind: 'wrong-fact',
        page: '/en/jobs/phd-position-in-glial-biology-k3f9a/',
        details: 'Fake details.',
        sentAt: '2026-09-02T10:00:00.000Z',
        status: 'new',
      },
    ])
    expect(document.dataRequests).toEqual([
      {
        kind: 'access',
        receivedAt: '2026-09-03T10:00:00.000Z',
        status: 'closed',
        closedAt: '2026-09-10T10:00:00.000Z',
      },
    ])
  })

  it('leaves out the records under an address for an account without one', () => {
    const document = exportDocument(
      data({ member: member({ email: null, emailVerifiedAt: null }), underAddress: null }),
      NOW,
    )
    expect(document.account.email).toBeNull()
    expect(document).not.toHaveProperty('suggestions')
    expect(document).not.toHaveProperty('reports')
    expect(document).not.toHaveProperty('dataRequests')
  })

  it('never holds a token or a hash, only when sessions end', () => {
    const text = JSON.stringify(exportDocument(data(), NOW))
    expect(text).not.toMatch(/token|hash/i)
    expect(text).not.toMatch(/[0-9a-f]{64}/)
  })
})

describe('exportFileName', () => {
  it('names the file by the UTC day of the export', () => {
    expect(exportFileName(NOW)).toBe('gliagora-data-2026-10-01.json')
    expect(exportFileName(new Date('2026-10-01T23:59:59.000Z'))).toBe(
      'gliagora-data-2026-10-01.json',
    )
  })
})

describe('handleExport', () => {
  it('answers a signed-in member with the file, as a download nobody stores', async () => {
    const response = await handleExport({
      now: NOW,
      member: async () => member(),
      read: async () => data(),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="gliagora-data-2026-10-01.json"',
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as { schema: string; account: { email: string } }
    expect(body.schema).toBe('gliagora-export/1')
    expect(body.account.email).toBe('member@example.org')
  })

  it('sends a visitor who is signed out to the privacy page, with a relative 303', async () => {
    const read = vi.fn()
    const response = await handleExport({ now: NOW, member: async () => null, read })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/en/account/privacy/')
    expect(read).not.toHaveBeenCalled()
  })

  it('leads to the privacy page with a reference when the data cannot be read', async () => {
    const response = await handleExport({
      now: NOW,
      member: async () => member(),
      read: async () => {
        throw new Error('member@example.org')
      },
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(
      /^\/en\/account\/privacy\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
    )
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toMatch(/^Data export failed \(reference [0-9A-F]{10}\): Error$/)
  })
})
