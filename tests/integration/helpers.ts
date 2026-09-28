import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { inject } from 'vitest'

import { FAKE_DATA } from '@/collections/Jobs'
import { addDays, storedDay } from '@/lib/jobs/deadline'
import type { Job } from '@/payload-types'

// Shared by the integration tests (pnpm test:db): Payload on the scratch database, and fake
// records (example.org addresses, invented titles; D38). Past dates are written with SQL or the
// fake-data context flag, since the collections refuse them, as they should.

export const DAY = 86_400_000
export const HOUR = 3_600_000

/**
 * Payload on the scratch database (tests/integration/setup-env.ts points DATABASE_URL at it).
 * Environment values that the config reads when it is loaded, such as SMTP_HOST, are set first,
 * so a test file that sends email loads the config only through here.
 */
export async function testPayload(env: Record<string, string> = {}): Promise<Payload> {
  Object.assign(process.env, env)
  const { default: config } = await import('@payload-config')
  const { getPayload } = await import('payload')
  const payload = await getPayload({ config })
  // Never the development database: stop at once if anything connected elsewhere.
  const connected = (payload.db as unknown as PostgresAdapter).poolOptions?.connectionString
  if (connected !== inject('databaseUrl')) {
    await payload.destroy()
    throw new Error('The tests are not connected to the scratch database.')
  }
  return payload
}

export function db(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

export async function rows<T extends Record<string, unknown>>(
  payload: Payload,
  query: SQL,
): Promise<T[]> {
  return (await db(payload).execute(query)).rows as T[]
}

let counter = 0
/** A name no other test uses. */
export const unique = (prefix: string) =>
  `${prefix}-${process.pid.toString(36)}${Date.now().toString(36)}${(++counter).toString(36)}`

export async function institution(payload: Payload, fields: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'institutions',
    data: {
      name: unique('Institute of Fake Neuroscience'),
      country: 'DE',
      city: 'Berlin',
      lat: 52.52,
      lng: 13.4,
      ...fields,
    } as never,
    depth: 0,
  })
}

async function term(payload: Payload, vocabulary: string, slug: string): Promise<number> {
  const { docs } = await payload.find({
    collection: 'terms',
    where: { vocabulary: { equals: vocabulary }, slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })
  const id = docs[0]?.id
  if (id === undefined) throw new Error(`Seeded term missing: ${vocabulary}/${slug}`)
  return id
}

/** The facts a job needs to be published (PLAN §6.4), with a deadline in 30 days. */
export async function publishFacts(payload: Payload): Promise<Partial<Job>> {
  const today = new Date().toISOString().slice(0, 10)
  return {
    positionType: await term(payload, 'position-type', 'phd'),
    subfields: [await term(payload, 'subfield', 'glia')],
    summary: 'A fake position for the integration tests of the scheduled tasks.',
    deadlineKind: 'fixed',
    deadlineDate: storedDay(addDays(today, 30)),
    deadlineTz: 'Europe/Berlin',
    verifiedAt: storedDay(today),
    originalLanguage: 'en',
    checks: {
      employerOrigin: true,
      positionOpen: true,
      deadlineConfirmed: true,
      ownWords: true,
      noPersonalContacts: true,
    },
    status: 'published',
  }
}

/**
 * A published job at `institutionId`, open for 30 more days. `fields` may back-date the status
 * times (the fake-data flag lets the collection keep them).
 */
export async function job(
  payload: Payload,
  institutionId: number,
  fields: Partial<Job> & Record<string, unknown> = {},
): Promise<Job> {
  return payload.create({
    collection: 'jobs',
    data: {
      title: `Fake position ${unique('job')}`,
      institution: institutionId,
      originalUrl: `https://www.example.org/careers/${unique('posting')}`,
      linkStatus: 'unchecked',
      ...(await publishFacts(payload)),
      confirmNotDuplicate: true,
      ...fields,
    } as never,
    depth: 0,
    context: { fakeData: FAKE_DATA },
  })
}

/** A suggestion as the "Suggest a listing" form stores it; a position gets its candidate. */
export async function suggestion(
  payload: Payload,
  fields: { email?: string | null; consent?: boolean; locale?: 'en' | 'tr'; kind?: string } = {},
) {
  const created = await payload.create({
    collection: 'submissions',
    data: {
      url: `https://www.example.org/jobs/${unique('suggested')}?utm_source=list`,
      kind: (fields.kind ?? 'position') as 'position',
      note: 'Fake data (integration test). Seen on a mailing list.',
      email: fields.email ?? null,
      consentToContact: fields.consent ?? false,
      locale: fields.locale ?? 'en',
      status: 'new',
    },
    overrideAccess: true,
    depth: 0,
  })
  return { ...created, candidateId: Number(created.candidate) }
}

/** Decides a candidate as an editor would: triage it (title, institution), then decide. */
export async function decide(
  payload: Payload,
  candidateId: number,
  institutionId: number,
  decision: {
    status: 'accepted' | 'rejected' | 'duplicate'
    reason?: string
    duplicateOf?: number
  },
) {
  await payload.update({
    collection: 'candidates',
    id: candidateId,
    data: { status: 'triaged', rawTitle: `Fake title ${unique('t')}`, institution: institutionId },
    depth: 0,
  })
  return payload.update({
    collection: 'candidates',
    id: candidateId,
    data: {
      status: decision.status,
      decisionReason: (decision.reason ?? null) as never,
      decisionNote: decision.reason === 'other' ? 'Fake note.' : null,
      duplicateOf: decision.duplicateOf ?? null,
    },
    depth: 0,
  })
}

/** Publishes the draft job an accepted candidate made, as an editor would. */
export async function publishDraft(payload: Payload, jobId: number) {
  return payload.update({
    collection: 'jobs',
    id: jobId,
    data: { ...(await publishFacts(payload)), confirmNotDuplicate: true } as never,
    depth: 0,
  })
}
