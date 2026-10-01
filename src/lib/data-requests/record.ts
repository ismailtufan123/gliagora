import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { inTransaction } from '@/jobs/maintenance/task'
import { deliverWhileWaiting } from '@/lib/email/deliver'
import { dataRequestConfirmEmail } from '@/lib/email/messages'
import type { DataRequestData } from '@/lib/forms/data-request-schema'
import { createEmailToken, deleteEmailToken } from '@/lib/members/store'

import { requestAddressHash } from './address'
import { DATA_REQUEST_PATHS } from './paths'

// Recording a request from the data-request form (M4b, D49; the M4b design §7.8 step 2). Every
// request that passes the form's checks leaves a minimal record at once: its kind, the date and a
// keyed hash of the address, nothing the person wrote (the database refuses more while it is
// unconfirmed). What they wrote (the address, and for requests other than a deletion the name and
// the details) waits in the confirmation link's row for 24 hours, and reaches the record only if
// they confirm it (confirm.ts). Both are written in one transaction. If the confirmation email
// cannot be sent, both are deleted again (`discardDataRequest`): the person sees "could not send"
// and no record says that a request arrived.

/** What the link's row keeps of the form until the person confirms (`email_tokens.request_data`). */
export type PendingRequest = Pick<DataRequestData, 'kind' | 'name' | 'details'>

/**
 * Records a request from the form, unconfirmed, with its confirmation link. Returns the record's ID
 * and the link's token, for the email only.
 */
export async function recordDataRequest(
  payload: Payload,
  data: DataRequestData,
  secret: string,
  now: Date,
): Promise<{ requestId: number; token: string }> {
  const emailHash = requestAddressHash(data.email, secret)
  if (!emailHash) throw new Error('A data request needs an email address')
  return inTransaction(payload, async (req, db) => {
    const record = await payload.create({
      collection: 'data-requests',
      data: {
        kind: data.kind,
        source: 'form',
        status: 'unconfirmed',
        locale: data.locale,
        receivedAt: now.toISOString(),
        emailHash,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
    const pending: PendingRequest = { kind: data.kind, name: data.name, details: data.details }
    const { token } = await createEmailToken(
      db,
      {
        purpose: 'data-request',
        email: data.email,
        requestId: record.id,
        locale: data.locale,
        requestData: pending,
      },
      now,
    )
    return { requestId: record.id, token }
  })
}

/**
 * Deletes a request recorded a moment ago, and its link, when the confirmation email could not be
 * sent. Only while it is unconfirmed: a request the person confirmed meanwhile stays.
 */
export async function discardDataRequest(
  payload: Payload,
  requestId: number,
  token: string,
): Promise<void> {
  await inTransaction(payload, async (_req, db) => {
    await deleteEmailToken(db, token)
    await db.execute(
      sql`DELETE FROM data_requests WHERE id = ${requestId} AND status = 'unconfirmed'`,
    )
  })
}

/**
 * What the form does once its checks pass (the Server Action, src/app/(frontend)/en/legal/
 * data-requests/actions.ts): records the request with its link, and emails the link while the
 * person waits. That email is also the acknowledgement that the request arrived. If the mail
 * server does not take it (it refuses it, cannot be reached or takes longer than 20 seconds), the
 * record and the link are deleted again and the form says it could not send the email:
 * 'unavailable'. `origin` is the site's own (`appOrigin`), which the link starts with.
 */
export async function recordAndSendDataRequest(
  payload: Payload,
  data: DataRequestData,
  { origin, secret, now }: { origin: string; secret: string; now: Date },
): Promise<void | 'unavailable'> {
  const { requestId, token } = await recordDataRequest(payload, data, secret, now)
  const link = `${origin}${DATA_REQUEST_PATHS.confirm}?token=${token}`
  const delivery = await deliverWhileWaiting(
    payload,
    data.email,
    dataRequestConfirmEmail({ locale: data.locale, kind: data.kind, link }),
    'Data request',
  )
  if (delivery === 'sent') return
  await discardDataRequest(payload, requestId, token)
  return 'unavailable'
}
