import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROR_IMPORT_CONTEXT } from '@/collections/Institutions'
import { type ReportRecord, reportRecord } from '@/lib/forms/report'
import type { ReportData } from '@/lib/forms/report-schema'
import { reportItemLookup } from '@/lib/records'
import { parseItemRef } from '@/lib/reports/item'

import { institution, job, testPayload, unique } from './helpers'

// "Report a problem" against a real, migrated database: what the form stores about the item its
// address names (a job, or an institution since D40), found as the page and the Server Action
// find it (src/lib/records.ts), and what happens to the link when the item is deleted.

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterAll(async () => {
  await payload?.destroy()
})

/** Stores a report as the Server Action does (src/app/(frontend)/en/report/actions.ts). */
async function send(kind: ReportData['kind'], item: string) {
  const data: ReportRecord = await reportRecord(
    {
      kind,
      details: 'Fake data (integration test). A name the institution also uses is missing.',
      email: null,
      locale: 'en',
      item: parseItemRef(item),
    },
    reportItemLookup,
    new Date(),
  )
  return payload.create({ collection: 'reports', data, overrideAccess: true, depth: 0 })
}

/** An institution from ROR (the import's context flag, so no request goes to the ROR API). */
async function rorInstitution(rorId: string) {
  const { docs } = await payload.find({
    collection: 'institutions',
    where: { rorId: { equals: rorId } },
    depth: 0,
  })
  return (
    docs[0] ??
    payload.create({
      collection: 'institutions',
      data: { name: unique('Fake Institute of Neuroscience'), rorId, status: 'active' } as never,
      depth: 0,
      context: { [ROR_IMPORT_CONTEXT]: true },
    })
  )
}

describe('reports about an institution', () => {
  it('link the institution the form names, by its short ID or ROR ID, with its page address', async () => {
    const manual = await institution(payload)
    expect(manual.shortId).toMatch(/^[0-9a-z]{5}$/)
    const aboutManual = await send('wrong-fact', `institution:${manual.shortId}`)
    expect(aboutManual).toMatchObject({
      kind: 'wrong-fact',
      institution: manual.id,
      itemUrl: `/en/institutions/${manual.slug}-${manual.shortId}/`,
      status: 'new',
    })
    expect(aboutManual.job ?? null).toBeNull()

    const fromRor = await rorInstitution('05dxps055')
    const aboutRor = await send('broken-link', 'institution:05dxps055')
    expect(aboutRor).toMatchObject({
      institution: fromRor.id,
      itemUrl: `/en/institutions/${fromRor.slug}-05dxps055/`,
    })
  })

  it('are kept without the item when the institution does not exist', async () => {
    const report = await send('other', 'institution:zzzzz')
    expect(report.institution ?? null).toBeNull()
    expect(report.itemUrl ?? null).toBeNull()
  })

  it('refuse a kind that only a job can have, also from code that stores one directly', async () => {
    const place = await institution(payload)
    const refused = await payload
      .create({
        collection: 'reports',
        data: {
          kind: 'closed',
          institution: place.id,
          itemUrl: `/en/institutions/${place.slug}-${place.shortId}/`,
          details: 'Fake data (integration test). Closed?',
          locale: 'en',
          status: 'new',
        },
        overrideAccess: true,
        depth: 0,
      })
      .then(
        () => null,
        (error: unknown) => error as { data?: { errors?: { path: string; message: string }[] } },
      )
    expect(refused?.data?.errors).toEqual([
      expect.objectContaining({
        path: 'kind',
        message: 'This kind is for reports about a job only, not about an institution.',
      }),
    ])
  })

  it('do not keep an institution added by hand: deleting it clears the link, and the address stays', async () => {
    const place = await institution(payload)
    const report = await send('wrong-fact', `institution:${place.shortId}`)
    expect(report.institution).toBe(place.id)

    await payload.delete({ collection: 'institutions', id: place.id, depth: 0 })
    expect(
      await payload.findByID({
        collection: 'institutions',
        id: place.id,
        depth: 0,
        disableErrors: true,
      }),
    ).toBeNull()
    const after = await payload.findByID({ collection: 'reports', id: report.id, depth: 0 })
    expect(after.institution ?? null).toBeNull()
    expect(after.itemUrl).toBe(`/en/institutions/${place.slug}-${place.shortId}/`)
    expect(after.kind).toBe('wrong-fact')
    // An editor can still handle it: the fixed fields hold what is left.
    const handled = await payload.update({
      collection: 'reports',
      id: report.id,
      data: { status: 'in-progress', actionNote: 'Fake note: the institution was merged.' },
      depth: 0,
    })
    expect(handled.status).toBe('in-progress')
  })
})

describe('reports about a job', () => {
  it('link a public job as before, and every kind is taken', async () => {
    const place = await institution(payload)
    const open = await job(payload, place.id)
    for (const kind of ['closed', 'not-employer', 'wrong-fact'] as const) {
      const report = await send(kind, `job:${open.shortId}`)
      expect(report, kind).toMatchObject({
        kind,
        job: open.id,
        itemUrl: `/en/jobs/${open.slug}-${open.shortId}/`,
      })
      expect(report.institution ?? null, kind).toBeNull()
    }
  })
})
