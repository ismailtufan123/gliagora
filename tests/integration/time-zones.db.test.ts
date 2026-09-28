import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROR_IMPORT_CONTEXT } from '@/collections/Institutions'
import { addDays, storedDay } from '@/lib/jobs/deadline'
import { importRorRecords } from '@/lib/ror/import'
import { isRorId } from '@/lib/ror/ror-id'

import { decide, institution, suggestion, testPayload, unique } from './helpers'

// D40: an institution's time zone comes from its coordinates unless an editor chose one, and a new
// job takes it for its deadline, against a real, migrated database. Fake institutions and jobs only.

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterAll(async () => {
  await payload?.destroy()
})

const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz'

/** A well-formed ROR ID that no real record is likely to have, different on every call. */
function fakeRorId(): string {
  for (;;) {
    const body = Array.from({ length: 6 }, () => BASE32[Math.floor(Math.random() * 32)]).join('')
    for (let check = 0; check < 100; check++) {
      const id = `0${body}${String(check).padStart(2, '0')}`
      if (isRorId(id)) return id
    }
  }
}

const rorRecord = (
  id: string,
  {
    lat,
    lng,
    modified,
    country = 'TR',
  }: { lat: number; lng: number; modified: string; country?: string },
) => ({
  id: `https://ror.org/${id}`,
  status: 'active',
  types: ['education'],
  names: [{ value: unique('Fake University'), types: ['ror_display', 'label'], lang: 'en' }],
  locations: [{ geonames_details: { country_code: country, name: 'Fake City', lat, lng } }],
  admin: { last_modified: { date: modified } },
})

async function* records(...items: unknown[]) {
  yield* items
}

const zoneOf = async (id: number) =>
  (await payload.findByID({ collection: 'institutions', id, depth: 0 })).timeZone

describe('institutions', () => {
  it("get the zone of their coordinates, and keep an editor's correction until they move", async () => {
    const place = await institution(payload) // Berlin
    expect(place.timeZone).toBe('Europe/Berlin')

    await payload.update({
      collection: 'institutions',
      id: place.id,
      data: { timeZone: 'Europe/Paris' },
      depth: 0,
    })
    expect(await zoneOf(place.id)).toBe('Europe/Paris')
    await payload.update({
      collection: 'institutions',
      id: place.id,
      data: { city: 'Berlin-Mitte' },
      depth: 0,
    })
    expect(await zoneOf(place.id)).toBe('Europe/Paris')

    await payload.update({
      collection: 'institutions',
      id: place.id,
      data: { city: 'Lisbon', country: 'PT', lat: 38.7223, lng: -9.1393 },
      depth: 0,
    })
    expect(await zoneOf(place.id)).toBe('Europe/Lisbon')

    // An emptied zone is filled in again from the coordinates.
    await payload.update({
      collection: 'institutions',
      id: place.id,
      data: { timeZone: null },
      depth: 0,
    })
    expect(await zoneOf(place.id)).toBe('Europe/Lisbon')
  })

  it('have no zone without coordinates, unless an editor gives one', async () => {
    // Only ROR institutions may lack coordinates.
    const created = await payload.create({
      collection: 'institutions',
      data: { name: unique('Fake Institute'), rorId: fakeRorId(), country: 'TR' } as never,
      depth: 0,
      context: { [ROR_IMPORT_CONTEXT]: true },
    })
    expect(created.timeZone).toBeNull()
    await payload.update({
      collection: 'institutions',
      id: created.id,
      data: { timeZone: 'Europe/Istanbul' },
      depth: 0,
    })
    expect(await zoneOf(created.id)).toBe('Europe/Istanbul')
  })

  it('get a zone of their own country, which follows a corrected country', async () => {
    // Pago Pago: the borders alone give Samoa's zone, a day ahead of American Samoa's.
    const pagoPago = { city: 'Pago Pago', lat: -14.27806, lng: -170.7025 }
    expect((await institution(payload, { ...pagoPago, country: 'AS' })).timeZone).toBe(
      'Pacific/Pago_Pago',
    )
    const misplaced = await institution(payload, { ...pagoPago, country: 'WS' })
    expect(misplaced.timeZone).toBe('Pacific/Apia')
    await payload.update({
      collection: 'institutions',
      id: misplaced.id,
      data: { country: 'AS' },
      depth: 0,
    })
    expect(await zoneOf(misplaced.id)).toBe('Pacific/Pago_Pago')
    // Abepura (Indonesian Papua): the borders give Papua New Guinea's zone, which no zone of
    // Indonesia matches, so the field is left to the editor.
    const abepura = { city: 'Abepura', country: 'ID', lat: -2.5964, lng: 140.6324 }
    expect((await institution(payload, abepura)).timeZone).toBeNull()
  })

  it('get their zone from the ROR import, which follows new coordinates', async () => {
    const rorId = fakeRorId()
    const first = await importRorRecords({
      payload,
      release: 'v0.1-test',
      records: records(rorRecord(rorId, { lat: 41.0082, lng: 28.9784, modified: '2026-01-01' })),
    })
    expect(first.created).toBe(1)
    const { docs } = await payload.find({
      collection: 'institutions',
      where: { rorId: { equals: rorId } },
      depth: 0,
    })
    const id = docs[0]!.id
    expect(docs[0]!.timeZone).toBe('Europe/Istanbul')

    // An editor's correction survives an import that changed something else in the record.
    await payload.update({
      collection: 'institutions',
      id,
      data: { timeZone: 'Europe/Athens' },
      depth: 0,
    })
    await importRorRecords({
      payload,
      release: 'v0.2-test',
      records: records(rorRecord(rorId, { lat: 41.0082, lng: 28.9784, modified: '2026-02-01' })),
    })
    expect(await zoneOf(id)).toBe('Europe/Athens')

    // The institution moved (Tbilisi): the zone follows the new coordinates.
    const moved = await importRorRecords({
      payload,
      release: 'v0.3-test',
      records: records(
        rorRecord(rorId, { lat: 41.7151, lng: 44.8271, modified: '2026-03-01', country: 'GE' }),
      ),
    })
    expect(moved.updated).toBe(1)
    expect(await zoneOf(id)).toBe('Asia/Tbilisi')

    // Dili: the import checks the zone against the record's country too.
    const dili = fakeRorId()
    await importRorRecords({
      payload,
      release: 'v0.4-test',
      records: records(
        rorRecord(dili, { lat: -8.55861, lng: 125.57361, modified: '2026-04-01', country: 'TL' }),
      ),
    })
    const { docs: timorLeste } = await payload.find({
      collection: 'institutions',
      where: { rorId: { equals: dili } },
      depth: 0,
    })
    expect(timorLeste[0]?.timeZone).toBe('Asia/Dili')
  })
})

describe('new jobs', () => {
  const draft = (institutionId: number, fields: Record<string, unknown> = {}) =>
    payload.create({
      collection: 'jobs',
      data: {
        title: `Fake position ${unique('job')}`,
        institution: institutionId,
        deadlineKind: 'fixed',
        deadlineDate: storedDay(addDays(new Date().toISOString().slice(0, 10), 40)),
        ...fields,
      } as never,
      depth: 0,
    })

  it("take their institution's zone when they are created without one", async () => {
    const place = await institution(payload, {
      country: 'SE',
      city: 'Stockholm',
      lat: 59.3294,
      lng: 18.0687,
    })
    expect(place.timeZone).toBe('Europe/Stockholm')
    const job = await draft(place.id)
    expect(job.deadlineTz).toBe('Europe/Stockholm')

    // Saves of the job never change it, even when the institution's zone changes.
    await payload.update({
      collection: 'institutions',
      id: place.id,
      data: { timeZone: 'Europe/Oslo' },
      depth: 0,
    })
    const saved = await payload.update({
      collection: 'jobs',
      id: job.id,
      data: { title: `Fake position ${unique('renamed')}` },
      depth: 0,
    })
    expect(saved.deadlineTz).toBe('Europe/Stockholm')
  })

  it('keep an empty zone given on purpose (Anywhere on Earth), and a zone of their own', async () => {
    const place = await institution(payload)
    const unknown = await draft(place.id, { deadlineTz: null })
    expect(unknown.deadlineTz).toBeNull()
    const own = await draft(place.id, { deadlineTz: 'Europe/London' })
    expect(own.deadlineTz).toBe('Europe/London')
    // An institution without a zone gives none.
    const noZone = await payload.create({
      collection: 'institutions',
      data: { name: unique('Fake Institute'), rorId: fakeRorId(), country: 'DE' } as never,
      depth: 0,
      context: { [ROR_IMPORT_CONTEXT]: true },
    })
    expect((await draft(noZone.id)).deadlineTz).toBeNull()
  })

  it('made from an accepted candidate take the zone of its institution', async () => {
    const place = await institution(payload, {
      country: 'TR',
      city: 'Istanbul',
      lat: 41.0082,
      lng: 28.9784,
    })
    const suggested = await suggestion(payload)
    const accepted = await decide(payload, suggested.candidateId, place.id, { status: 'accepted' })
    const jobId = Number(accepted.publishedRef)
    const job = await payload.findByID({ collection: 'jobs', id: jobId, depth: 0 })
    expect(job.deadlineTz).toBe('Europe/Istanbul')
  })
})
