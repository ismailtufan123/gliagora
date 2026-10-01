import { sql } from '@payloadcms/db-postgres'

import { jobPath } from '@/lib/detail-routes'
import { errorCode, errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { type ListingState, listingState } from '@/lib/jobs/deadline'
import { SITE_ORIGIN } from '@/lib/site'

import { outcomePath } from './outcome'
import { MEMBER_PATHS } from './paths'
import { seeOther } from './responses'
import {
  type MemberDb,
  type MemberRecord,
  type SavedJobExportRow,
  MemberStoreError,
  savedJobsForExport,
  sessionExpiries,
  storedSubfieldPrefs,
} from './store'

// "Download my data" (M4b, D49; the M4b design §7.5): GET /en/account/privacy/export/ answers a
// JSON file with everything Gliagora holds about the signed-in member: the account, the Glia Notes
// choice, the preferred subfields, the saved positions, the sessions (how many, and when each ends;
// never their tokens) and, when the account has an email address (always one the member proved),
// the suggestions, reports and data requests sent with that address, matched without case (the
// forms keep an address as it was typed). A download (`Content-Disposition: attachment`), never
// stored by caches. Signed out, it leads to the privacy page, which shows the sign-in panel.

/** The export's format, for anyone who reads the file with a program. */
export const EXPORT_SCHEMA = 'gliagora-export/1'

/** A suggestion sent with the member's address ("Suggest a listing"). */
export type ExportedSuggestion = {
  link: string
  kind: string
  note: string | null
  sentAt: Date
  status: string
}

/** A report sent with the member's address ("Report a problem"). */
export type ExportedReport = {
  kind: string
  page: string | null
  details: string
  sentAt: Date
  status: string
}

/** A data request recorded under the member's address. */
export type ExportedDataRequest = {
  kind: string
  receivedAt: Date | null
  status: string
  closedAt: Date | null
}

/** What the export reads: the member, their own rows, and the records under their address. */
export type ExportData = {
  member: MemberRecord
  subfields: { slug: string; label: string | null; active: boolean }[]
  saved: SavedJobExportRow[]
  sessions: Date[]
  /** Null when the account has no email address. */
  underAddress: {
    suggestions: ExportedSuggestion[]
    reports: ExportedReport[]
    dataRequests: ExportedDataRequest[]
  } | null
}

const date = (value: Date | null | undefined) => (value ? value.toISOString() : null)

/** The address of a saved position's page, or null for a job without one. */
const jobUrl = (row: SavedJobExportRow) =>
  row.slug && row.shortId ? new URL(jobPath(row.slug, row.shortId), SITE_ORIGIN).toString() : null

/** What a saved position's page shows now. */
const stateOf = (row: SavedJobExportRow, now: Date): ListingState => listingState(row, now)

/** The export's document, as it is written to the file. */
export function exportDocument(data: ExportData, now: Date) {
  const { member } = data
  return {
    schema: EXPORT_SCHEMA,
    exportedAt: now.toISOString(),
    account: {
      email: member.email,
      emailVerifiedAt: date(member.emailVerifiedAt),
      emailVerifiedBy: member.emailVerifiedBy,
      googleAccountId: member.googleId,
      orcidId: member.orcidId,
      displayName: member.displayName,
      joinedAt: date(member.createdAt),
      lastActiveAt: date(member.lastSeenAt),
      inactivityWarningAt: date(member.deletionWarnedAt),
      inactivityWarningRefusedAt: date(member.warningRefusedAt),
    },
    gliaNotes: {
      on: member.digestOptIn,
      changedAt: date(member.digestChangedAt),
      consentVersion: member.digestConsentVersion,
    },
    preferredSubfields: data.subfields.map((subfield) => ({
      slug: subfield.slug,
      label: subfield.label,
      active: subfield.active,
    })),
    savedPositions: data.saved.map((row) => ({
      title: row.title,
      url: jobUrl(row),
      savedAt: row.savedAt.toISOString(),
      state: stateOf(row, now),
    })),
    sessions: {
      count: data.sessions.length,
      expiresAt: data.sessions.map((end) => end.toISOString()),
    },
    ...(data.underAddress
      ? {
          suggestions: data.underAddress.suggestions.map((row) => ({
            link: row.link,
            kind: row.kind,
            note: row.note,
            sentAt: row.sentAt.toISOString(),
            status: row.status,
          })),
          reports: data.underAddress.reports.map((row) => ({
            kind: row.kind,
            page: row.page,
            details: row.details,
            sentAt: row.sentAt.toISOString(),
            status: row.status,
          })),
          dataRequests: data.underAddress.dataRequests.map((row) => ({
            kind: row.kind,
            receivedAt: date(row.receivedAt),
            status: row.status,
            closedAt: date(row.closedAt),
          })),
        }
      : {}),
  }
}

/** The file's name: `gliagora-data-2026-10-01.json`, the UTC day of the export. */
export const exportFileName = (now: Date) => `gliagora-data-${now.toISOString().slice(0, 10)}.json`

const toDate = (value: unknown): Date | null => {
  if (value == null) return null
  const parsed = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * The suggestions, reports and data requests stored with `email` (the account's address, stored
 * lowercased), matched without case: the forms keep an address as it was typed. Every value is a
 * parameter; errors carry no values (MemberStoreError).
 */
export async function recordsUnderAddress(
  db: MemberDb,
  email: string,
): Promise<NonNullable<ExportData['underAddress']>> {
  try {
    const address = email.toLowerCase()
    const suggestions = await db.execute<{
      url: string
      kind: string
      note: string | null
      created_at: unknown
      status: string
    }>(sql`
      SELECT url, kind, note, created_at, status FROM submissions
      WHERE lower(email) = ${address} ORDER BY created_at, id`)
    const reports = await db.execute<{
      kind: string
      item_url: string | null
      details: string
      created_at: unknown
      status: string
    }>(sql`
      SELECT kind, item_url, details, created_at, status FROM reports
      WHERE lower(email) = ${address} ORDER BY created_at, id`)
    const requests = await db.execute<{
      kind: string
      received_at: unknown
      status: string
      closed_at: unknown
    }>(sql`
      SELECT kind, received_at, status, closed_at FROM data_requests
      WHERE lower(email) = ${address} ORDER BY received_at, id`)
    return {
      suggestions: suggestions.rows.map((row) => ({
        link: row.url,
        kind: row.kind,
        note: row.note,
        sentAt: toDate(row.created_at) as Date,
        status: row.status,
      })),
      reports: reports.rows.map((row) => ({
        kind: row.kind,
        page: row.item_url,
        details: row.details,
        sentAt: toDate(row.created_at) as Date,
        status: row.status,
      })),
      dataRequests: requests.rows.map((row) => ({
        kind: row.kind,
        receivedAt: toDate(row.received_at),
        status: row.status,
        closedAt: toDate(row.closed_at),
      })),
    }
  } catch (error) {
    if (error instanceof MemberStoreError) throw error
    throw new MemberStoreError(errorCode(error) ?? 'unknown', 'export')
  }
}

/** Everything the export holds about `member`, read from the database. */
export async function readExport(
  db: MemberDb,
  member: MemberRecord,
  now: Date,
): Promise<ExportData> {
  const [subfields, saved, sessions, underAddress] = await Promise.all([
    storedSubfieldPrefs(db, member.id),
    savedJobsForExport(db, member.id),
    sessionExpiries(db, member.id, now),
    member.email ? recordsUnderAddress(db, member.email) : Promise.resolve(null),
  ])
  return { member, subfields, saved, sessions, underAddress }
}

/** What the export route reads (the route gives the real ones). */
export type ExportDeps = {
  now: Date
  /** The member of the request's session cookie (recording activity), or null. */
  member(): Promise<MemberRecord | null>
  read(member: MemberRecord): Promise<ExportData>
}

/** GET `/en/account/privacy/export/`. */
export async function handleExport(deps: ExportDeps): Promise<Response> {
  try {
    const member = await deps.member()
    if (!member) return seeOther(MEMBER_PATHS.privacy)
    const body = JSON.stringify(exportDocument(await deps.read(member), deps.now), null, 2)
    return new Response(`${body}\n`, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName(deps.now)}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const reference = newReference()
    console.error(`Data export failed (reference ${reference}): ${errorSummary(error)}`)
    return seeOther(outcomePath(MEMBER_PATHS.privacy, { error: 'failed', reference }))
  }
}
