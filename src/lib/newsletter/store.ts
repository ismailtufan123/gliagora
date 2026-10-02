import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import {
  CONSENT_EVENTS,
  CONSENT_SOURCES,
  type ConsentEvent,
  type ConsentSource,
} from '@/collections/ConsentLog'
import { errorCode } from '@/lib/errors'
import { type MemberDb, constraintOf } from '@/lib/members/store'
import { consentLogCutoff } from '@/lib/retention/rules'

import { CONSENT_VERSION_PATTERN, SUBSCRIBER_ID_MAX, SUBSCRIBER_UUID_PATTERN } from './consent'

// Glia Notes' rows in the app's database (M2, D50; PLAN §5.1, §18.1): the consent records and the
// deletion log's listmonk subscribers. Written only here, in SQL with every value a parameter,
// through Payload's connection or the caller's transaction (`inTransaction`), like the member
// store (src/lib/members/store.ts): Payload's hooks and field checks do not run, so the limits are
// checked here (zod) and the rules that matter are database constraints
// (20261002_190000_newsletter_constraints). No email address is ever written here. Errors never
// carry values: a NewsletterStoreError has the database's code and a constraint or field name.

/** A failure without the values involved: the PostgreSQL code (or `invalid`) and a name. */
export class NewsletterStoreError extends Error {
  override name = 'NewsletterStoreError'
  readonly code: string
  /** The constraint that refused a row, or the input field that was refused. */
  readonly target?: string

  constructor(code: string, target?: string) {
    super(`Newsletter data not stored (${[code, target].filter(Boolean).join(' ')})`)
    this.code = code
    this.target = target
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof NewsletterStoreError) throw error
    throw new NewsletterStoreError(errorCode(error) ?? 'unknown', constraintOf(error))
  }
}

function checked<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new NewsletterStoreError('invalid', name)
  return result.data
}

const iso = (date: Date) => date.toISOString()

/** One consent record (src/collections/ConsentLog.ts). */
export type ConsentRecord = {
  /** listmonk's subscriber UUID (null only for a record whose subscriber is unknown). */
  subscriberUuid: string | null
  /** listmonk's subscriber ID, with the UUID (null with it). */
  subscriberId: number | null
  event: ConsentEvent
  /** The consent text's version, for a request or a confirmation; none for an unsubscribe. */
  consentVersion: string | null
  source: ConsentSource
  at: Date
}

const subscriberId = z.number().int().positive().max(SUBSCRIBER_ID_MAX)

const consentRecord = z
  .object({
    subscriberUuid: z.string().regex(SUBSCRIBER_UUID_PATTERN).nullable(),
    subscriberId: subscriberId.nullable(),
    event: z.enum(CONSENT_EVENTS),
    consentVersion: z.string().regex(CONSENT_VERSION_PATTERN).nullable(),
    source: z.enum(CONSENT_SOURCES),
    at: z.date(),
  })
  .refine((value) => value.event === 'unsubscribed' || value.consentVersion !== null)
  .refine((value) => (value.subscriberUuid === null) === (value.subscriberId === null))

/** Writes consent records, in the caller's transaction when it has one. */
export function recordConsent(
  db: MemberDb,
  records: readonly ConsentRecord[],
  now: Date,
): Promise<void> {
  return guarded(async () => {
    if (records.length === 0) return
    const values = records.map((record) => checked(consentRecord, record, 'consent'))
    await db.execute(sql`
      INSERT INTO consent_log (subscriber_uuid, subscriber_id, event, consent_version, source, at,
        created_at, updated_at)
      VALUES ${sql.join(
        values.map(
          (value) =>
            sql`(${value.subscriberUuid}, ${value.subscriberId}, ${value.event},
              ${value.consentVersion}, ${value.source}, ${iso(value.at)}, ${iso(now)}, ${iso(now)})`,
        ),
        sql`, `,
      )}`)
  })
}

/**
 * Logs the deletion of a listmonk subscriber (`deletion_log`, `newsletter`): written in the same
 * transaction as the consent record of the unsubscribe, before listmonk is asked to delete it, so
 * the task `applyDeletionLog` deletes it again if that fails or a restore of listmonk's database
 * brings it back.
 */
export function logSubscriberDeletion(db: MemberDb, id: number, now: Date): Promise<void> {
  return guarded(async () => {
    await db.execute(sql`
      INSERT INTO deletion_log (target_collection, target_id, action, at)
      VALUES ('newsletter', ${checked(subscriberId, id, 'subscriberId')}, 'delete', ${iso(now)})`)
  })
}

/** Whether the deletion log names any listmonk subscriber (nothing to check in listmonk if not). */
export function hasLoggedSubscribers(db: MemberDb): Promise<boolean> {
  return guarded(async () => {
    const { rows } = await db.execute<{ found: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM deletion_log
        WHERE target_collection = 'newsletter' AND action = 'delete') AS found`)
    return rows[0]?.found === true
  })
}

const subscriberIds = z.array(subscriberId).max(1000)
const subscriberUuids = z.array(z.string().regex(SUBSCRIBER_UUID_PATTERN)).max(1000)

const toDate = (value: unknown) => (value instanceof Date ? value : new Date(String(value)))

/**
 * The latest logged deletion of each of these listmonk subscriber IDs that the log names (at most
 * 1,000 IDs, a page of listmonk's list).
 */
export function latestLoggedDeletions(
  db: MemberDb,
  ids: readonly number[],
): Promise<Map<number, Date>> {
  return guarded(async () => {
    const wanted = checked(subscriberIds, [...ids], 'ids')
    if (wanted.length === 0) return new Map()
    const { rows } = await db.execute<{ target_id: number | string; at: unknown }>(sql`
      SELECT target_id, max(at) AS at FROM deletion_log
      WHERE target_collection = 'newsletter' AND action = 'delete'
        AND target_id IN (${sql.join(
          wanted.map((id) => sql`${id}`),
          sql`, `,
        )})
      GROUP BY target_id`)
    return new Map(rows.map((row) => [Number(row.target_id), toDate(row.at)]))
  })
}

/** The latest `confirmed` record of each of these subscriber UUIDs that has one (at most 1,000). */
export function latestConfirmations(
  db: MemberDb,
  uuids: readonly string[],
): Promise<Map<string, Date>> {
  return guarded(async () => {
    const wanted = checked(subscriberUuids, [...uuids], 'uuids')
    if (wanted.length === 0) return new Map()
    const { rows } = await db.execute<{ subscriber_uuid: string; at: unknown }>(sql`
      SELECT subscriber_uuid, max(at) AS at FROM consent_log
      WHERE event = 'confirmed' AND subscriber_uuid IN (${sql.join(
        wanted.map((uuid) => sql`${uuid}`),
        sql`, `,
      )})
      GROUP BY subscriber_uuid`)
    return new Map(rows.map((row) => [row.subscriber_uuid, toDate(row.at)]))
  })
}

/** A subscription the consent log holds as running: listmonk's subscriber that should exist. */
export type OpenSubscription = { uuid: string; id: number }

/**
 * Every subscription whose newest consent record is a request or a confirmation (not an
 * unsubscribe), newest first, with listmonk's subscriber ID that record names.
 */
export function openSubscriptions(db: MemberDb): Promise<OpenSubscription[]> {
  return guarded(async () => {
    const { rows } = await db.execute<{ subscriber_uuid: string; subscriber_id: number | string }>(
      sql`
      SELECT subscriber_uuid, subscriber_id FROM (
        SELECT DISTINCT ON (subscriber_uuid) subscriber_uuid, subscriber_id, event, at
        FROM consent_log
        WHERE subscriber_uuid IS NOT NULL
        ORDER BY subscriber_uuid, at DESC, id DESC) newest
      WHERE event::text <> 'unsubscribed' AND subscriber_id IS NOT NULL
      ORDER BY at DESC`,
    )
    return rows.map((row) => ({ uuid: row.subscriber_uuid, id: Number(row.subscriber_id) }))
  })
}

/**
 * Records the end of subscriptions listmonk no longer has (event `unsubscribed`, source
 * `listmonk`), so their consent records are deleted 3 years later (CONSENT_LOG_YEARS); only where
 * the newest record is still not an unsubscribe. Returns how many it recorded.
 */
export function recordEndedSubscriptions(
  db: MemberDb,
  ended: readonly OpenSubscription[],
  now: Date,
): Promise<number> {
  return guarded(async () => {
    let recorded = 0
    for (const subscription of ended) {
      const uuid = checked(z.string().regex(SUBSCRIBER_UUID_PATTERN), subscription.uuid, 'uuid')
      const id = checked(subscriberId, subscription.id, 'id')
      const { rows } = await db.execute<{ id: number }>(sql`
        INSERT INTO consent_log (subscriber_uuid, subscriber_id, event, consent_version, source, at,
          created_at, updated_at)
        SELECT ${uuid}, ${id}, 'unsubscribed', NULL, 'listmonk', ${iso(now)}, ${iso(now)},
          ${iso(now)}
        WHERE (SELECT event::text FROM consent_log WHERE subscriber_uuid = ${uuid}
          ORDER BY at DESC, id DESC LIMIT 1) IS DISTINCT FROM 'unsubscribed'
        RETURNING id`)
      recorded += rows.length
    }
    return recorded
  })
}

/**
 * Deletes at most `limit` consent records whose time is up (CONSENT_LOG_YEARS): those of a
 * subscription that ended 3 years ago (its newest record is an unsubscribe, written by then), and
 * those without a subscriber written 3 years ago. Returns how many it deleted.
 */
export function purgeConsentLog(db: MemberDb, now: Date, limit: number): Promise<number> {
  return guarded(async () => {
    const n = checked(z.number().int().min(1).max(10_000), limit, 'limit')
    const cutoff = iso(consentLogCutoff(now))
    const { rows } = await db.execute<{ id: number }>(sql`
      WITH ended AS (
        SELECT subscriber_uuid FROM consent_log
        WHERE subscriber_uuid IS NOT NULL
        GROUP BY subscriber_uuid
        HAVING max(at) <= ${cutoff}
          AND max(at) FILTER (WHERE event = 'unsubscribed') = max(at))
      DELETE FROM consent_log WHERE id IN (
        SELECT id FROM consent_log
        WHERE (subscriber_uuid IS NULL AND at <= ${cutoff})
          OR subscriber_uuid IN (SELECT subscriber_uuid FROM ended)
        ORDER BY id
        LIMIT ${n})
      RETURNING id`)
    return rows.length
  })
}
