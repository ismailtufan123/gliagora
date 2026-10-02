import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import { type TransactionDb, inTransaction } from '@/jobs/maintenance/task'
import { errorSummary } from '@/lib/errors'
import { DETAILS_MAX, NAME_MAX } from '@/lib/forms/fields'
import { newReference } from '@/lib/forms/public-form'
import { sameOrigin } from '@/lib/members/origin'
import { outcomePath } from '@/lib/members/outcome'
import { forbidden, formValue, readForm, seeOther } from '@/lib/members/responses'
import {
  type EmailTokenRecord,
  consumeEmailToken,
  deleteMember,
  findMember,
} from '@/lib/members/store'
import { isToken } from '@/lib/members/tokens'
import { eraseNewsletter, finishNewsletterErasure } from '@/lib/newsletter/erase'
import { PERSONAL_RIGHTS } from '@/lib/reports/status'
import type { DataRequest } from '@/payload-types'

import { DATA_REQUEST_KINDS, type DataRequestKind } from './kinds'
import type { DeletionOutcome } from './outcome'
import { DATA_REQUEST_PATHS } from './paths'
import type { PendingRequest } from './record'
import { AUTOMATIC_ACTION } from './status'

// Confirming a request from the data-request form (M4b, D49; the M4b design §7.8 step 4): the
// button on the page the emailed link opens posts to /en/legal/data-requests/confirm/use/. The
// link is consumed for its own purpose and everything it leads to happens in one transaction, so a
// failure changes nothing and the link still works.
//
// - A deletion is done at once, for the address the link proved:
//   - the suggestions sent with it, found without regard to case (suggestions keep the address as
//     typed), deleted through the local API as editors delete them, so their candidates keep their
//     decision and each deletion is logged (the `logDeletions()` hook);
//   - its Glia Notes subscription, and the subscriber of a member with it (`eraseNewsletter`, M2:
//     logged deletions in listmonk, deleted there after the commit, and unlinked consent records;
//     listmonk unreachable fails the whole confirmation, and the link still works);
//   - a member account with it (`deleteMember`, which logs it too);
//   - the address on the reports sent with it, each logged as `clear-email`, except requests about
//     personal rights (Law No. 5651), whose handling we must be able to show: they keep it for
//     their period, and are counted.
//   The record is then closed, as deleted automatically, with the address and these counts: the
//   final email goes out from it (`sendRequestEmails`), and it is kept 2 years.
// - Any other request is recorded with what the person wrote, as New: an editor answers it within
//   30 days of its receipt (the review dashboard counts it).

export type Confirmation = { kind: 'deleted'; outcome: DeletionOutcome } | { kind: 'registered' }

const KINDS = DATA_REQUEST_KINDS.map((kind) => kind.value) as [
  DataRequestKind,
  ...DataRequestKind[],
]

/** What the link's row keeps of the form (record.ts), as far as it can be trusted. */
const pendingSchema = z.object({
  kind: z.enum(KINDS),
  name: z.string().max(NAME_MAX).nullable().catch(null),
  details: z.string().max(DETAILS_MAX).nullable().catch(null),
})

/** What a data-request link asks for, or null if the link is not one. */
export function pendingRequest(link: EmailTokenRecord | null): PendingRequest | null {
  if (!link || link.purpose !== 'data-request') return null
  const parsed = pendingSchema.safeParse(link.requestData)
  return parsed.success ? parsed.data : null
}

/** A link whose row the site wrote itself, yet cannot read: nothing is done, nothing changes. */
class UnreadableRequest extends Error {
  override name = 'UnreadableRequest'
}

/** A local API call that refused some of the records it was asked to delete. */
class NotDeleted extends Error {
  override name = 'NotDeleted'
}

/** What a deletion by address did, and the listmonk subscribers to delete after the commit. */
export type AddressErasure = { outcome: DeletionOutcome; subscriberIds: number[] }

/**
 * Deletes what is held under `email` (see above), in the caller's transaction: `req` for the local
 * API, `db` for SQL. `email` is in its stored form (lowercased).
 */
export async function eraseByAddress(
  payload: Payload,
  req: PayloadRequest,
  db: TransactionDb,
  email: string,
  now: Date,
): Promise<AddressErasure> {
  const at = now.toISOString()

  const { rows: sent } = await db.execute<{ id: number }>(
    sql`SELECT id FROM submissions WHERE lower(email) = ${email} ORDER BY id`,
  )
  let suggestionsDeleted = 0
  if (sent.length > 0) {
    const { docs, errors } = await payload.delete({
      collection: 'submissions',
      where: { id: { in: sent.map((row) => Number(row.id)) } },
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (errors.length > 0) throw new NotDeleted('submissions')
    suggestionsDeleted = docs.length
  }

  const member = await findMember(db, { email }, { forUpdate: true })
  const newsletter = await eraseNewsletter(
    db,
    { email, member: member && { id: member.id, subscriber: member.digestSubscriber } },
    now,
  )
  const accountDeleted =
    member && (await deleteMember(db, member.id, { reason: 'request' }, now)) ? 1 : 0

  // In SQL, as `applyDeletionLog` repeats it: the report's fields from the form are fixed for every
  // save (fixedFieldHooks), and reports keep no versions, so this clears the only copy.
  const { rows: cleared } = await db.execute<{ id: number }>(sql`
    UPDATE reports SET email = NULL, updated_at = ${at}
    WHERE lower(email) = ${email} AND kind <> ${PERSONAL_RIGHTS}
    RETURNING id`)
  if (cleared.length > 0) {
    await db.execute(sql`
      INSERT INTO deletion_log (target_collection, target_id, action, at)
      VALUES ${sql.join(
        cleared.map((row) => sql`('reports', ${Number(row.id)}, 'clear-email', ${at})`),
        sql`, `,
      )}`)
  }
  const { rows: kept } = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM reports
    WHERE lower(email) = ${email} AND kind = ${PERSONAL_RIGHTS}`)

  return {
    outcome: {
      suggestionsDeleted,
      accountDeleted,
      newsletterRemoved: newsletter.removed > 0 ? 1 : 0,
      reportAddressesCleared: cleared.length,
      personalRightsReportsKept: Number(kept[0]?.n ?? 0),
    },
    subscriberIds: newsletter.subscriberIds,
  }
}

/** What a confirmation stores on the request. */
type Settled = Pick<DataRequest, 'email' | 'status'> &
  Partial<Pick<DataRequest, 'name' | 'details' | 'action' | 'outcome'>>

/**
 * Stores what the confirmation settled on the request's minimal record. That record outlives its
 * link (60 days against 24 hours), so it is always there, unless a restore brought back an older
 * copy of the table: the request is then recorded anew, received now.
 */
async function settle(
  payload: Payload,
  req: PayloadRequest,
  link: EmailTokenRecord,
  kind: DataRequestKind,
  data: Settled,
  now: Date,
): Promise<void> {
  const saved =
    link.requestId == null
      ? null
      : await payload.findByID({
          collection: 'data-requests',
          id: link.requestId,
          depth: 0,
          overrideAccess: true,
          disableErrors: true,
          req,
        })
  if (saved?.status === 'unconfirmed') {
    await payload.update({
      collection: 'data-requests',
      id: saved.id,
      data,
      depth: 0,
      overrideAccess: true,
      req,
    })
    return
  }
  await payload.create({
    collection: 'data-requests',
    data: { kind, source: 'form', locale: link.locale, receivedAt: now.toISOString(), ...data },
    depth: 0,
    overrideAccess: true,
    req,
  })
}

/**
 * Uses a data-request link (see above): what happened, or null when the link is unknown, used,
 * expired or made for something else. After the commit, the erased Glia Notes subscribers are
 * deleted in listmonk (best effort: the deletion log repeats it).
 */
export async function confirmDataRequest(
  payload: Payload,
  token: string | null | undefined,
  now: Date,
): Promise<Confirmation | null> {
  let subscriberIds: number[] = []
  const confirmation = await inTransaction(
    payload,
    async (req, db): Promise<Confirmation | null> => {
      const link = await consumeEmailToken(db, token, 'data-request', now)
      if (!link) return null
      const pending = pendingRequest(link)
      if (!pending) throw new UnreadableRequest()
      if (pending.kind === 'deletion') {
        const erased = await eraseByAddress(payload, req, db, link.email, now)
        const { outcome } = erased
        await settle(
          payload,
          req,
          link,
          pending.kind,
          { email: link.email, status: 'closed', action: AUTOMATIC_ACTION, outcome },
          now,
        )
        subscriberIds = erased.subscriberIds
        return { kind: 'deleted', outcome }
      }
      await settle(
        payload,
        req,
        link,
        pending.kind,
        { email: link.email, name: pending.name, details: pending.details, status: 'new' },
        now,
      )
      return { kind: 'registered' }
    },
  )
  await finishNewsletterErasure(subscriberIds)
  return confirmation
}

/** What the confirmation route reads and does (the route gives the real ones). */
export type ConfirmationDeps = {
  env?: Record<string, string | undefined>
  confirm(token: string | null): Promise<Confirmation | null>
}

/**
 * POST `/en/legal/data-requests/confirm/use/`: only from the site's own pages (`sameOrigin`), so
 * another site cannot confirm a request with a link it got hold of. A deletion ends on `done/`, any
 * other request on `received/`. A link that is unknown, used or expired leads to the link's page
 * without it, which says so (and that a request confirmed a moment ago, by a double press, is
 * done). A failure changes nothing (one transaction): back to the link's page, which still works,
 * with a reference that the log line repeats with the error's class and code only.
 */
export async function handleConfirmation(
  request: Request,
  deps: ConfirmationDeps,
): Promise<Response> {
  if (!sameOrigin(request.headers, deps.env)) return forbidden()
  const token = formValue(await readForm(request), 'token')
  try {
    const result = await deps.confirm(token)
    if (!result) return seeOther(DATA_REQUEST_PATHS.confirm)
    return seeOther(
      result.kind === 'deleted' ? DATA_REQUEST_PATHS.done : DATA_REQUEST_PATHS.received,
    )
  } catch (error) {
    const reference = newReference()
    console.error(
      `Data request confirmation failed (reference ${reference}): ${errorSummary(error)}`,
    )
    return seeOther(
      outcomePath(
        DATA_REQUEST_PATHS.confirm,
        { error: 'failed', reference },
        { token: isToken(token) ? token : null },
      ),
    )
  }
}
