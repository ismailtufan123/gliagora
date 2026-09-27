import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { importRorRecords } from './import'

type Stored = { id: number; rorId: string; rorLastModified: string; data: Record<string, unknown> }

/** A stand-in for Payload's local API with an in-memory institutions table. */
function fakePayload(existing: Stored[] = [], { failOn }: { failOn?: string } = {}) {
  const rows = [...existing]
  const payload = {
    find: vi.fn(
      async ({
        collection,
        page = 1,
        limit,
      }: {
        collection: string
        page?: number
        limit?: number
      }) => {
        if (collection === 'countries') return { docs: [{ id: 'US' }, { id: 'TR' }] }
        const all = rows.map(({ id, rorId, rorLastModified }) => ({ id, rorId, rorLastModified }))
        const size = limit ?? all.length
        return {
          docs: all.slice((page - 1) * size, page * size),
          hasNextPage: page * size < all.length,
        }
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (data.rorId === failOn) throw new Error('database refused')
      const row = {
        id: rows.length + 1,
        rorId: data.rorId as string,
        rorLastModified: data.rorLastModified as string,
        data,
      }
      rows.push(row)
      return row
    }),
    update: vi.fn(async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error('not found')
      Object.assign(row, { rorLastModified: data.rorLastModified, data })
      return row
    }),
    logger: { warn: vi.fn(), info: vi.fn() },
  }
  return { payload: payload as unknown as Payload, spies: payload, rows }
}

const record = (id: string, changes: Record<string, unknown> = {}) => ({
  id: `https://ror.org/${id}`,
  status: 'active',
  types: ['education'],
  names: [{ value: `Institution ${id}`, types: ['ror_display', 'label'], lang: 'en' }],
  locations: [
    { geonames_details: { country_code: 'US', name: 'Pasadena', lat: 34.1, lng: -118.1 } },
  ],
  links: [{ type: 'website', value: 'https://www.example.edu/' }],
  admin: { last_modified: { date: '2025-05-05' } },
  ...changes,
})

async function* stream(items: unknown[]) {
  yield* items
}

describe('importRorRecords', () => {
  it('creates new institutions with their slug, country and release', async () => {
    const { payload, rows } = fakePayload()
    const counts = await importRorRecords({
      payload,
      records: stream([record('05dxps055')]),
      release: 'v2.13',
    })
    expect(counts).toMatchObject({ read: 1, created: 1 })
    expect(rows[0]?.data).toMatchObject({
      rorId: '05dxps055',
      name: 'Institution 05dxps055',
      slug: 'institution-05dxps055',
      country: 'US',
      origin: 'ror',
      rorRelease: 'v2.13',
    })
  })

  it('leaves unchanged records alone and updates changed ones', async () => {
    const { payload, spies } = fakePayload([
      { id: 1, rorId: '05dxps055', rorLastModified: '2025-05-05', data: {} },
      { id: 2, rorId: '02d439m40', rorLastModified: '2024-12-01', data: {} },
    ])
    const counts = await importRorRecords({
      payload,
      records: stream([record('05dxps055'), record('02d439m40')]),
      release: 'v2.13',
    })
    expect(counts).toMatchObject({ unchanged: 1, updated: 1, created: 0 })
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, context: { rorImport: true } }),
    )
  })

  it('does not add withdrawn records, but updates ones already imported', async () => {
    const withdrawn = { status: 'withdrawn', admin: { last_modified: { date: '2026-09-01' } } }
    const { payload, rows } = fakePayload([
      { id: 1, rorId: '02d439m40', rorLastModified: '2024-12-01', data: {} },
    ])
    const counts = await importRorRecords({
      payload,
      records: stream([record('05dxps055', withdrawn), record('02d439m40', withdrawn)]),
      release: 'v2.13',
    })
    expect(counts).toMatchObject({ skipped: 1, updated: 1, created: 0 })
    expect(rows[0]?.data).toMatchObject({ status: 'withdrawn' })
  })

  it('leaves the country empty when it is not in the country list', async () => {
    const { payload, rows } = fakePayload()
    await importRorRecords({
      payload,
      records: stream([
        record('05dxps055', { locations: [{ geonames_details: { country_code: 'ZZ' } }] }),
      ]),
      release: 'v2.13',
    })
    expect(rows[0]?.data.country).toBeNull()
  })

  it('counts invalid records and database refusals, and carries on', async () => {
    const { payload, spies } = fakePayload([], { failOn: '02d439m40' })
    const counts = await importRorRecords({
      payload,
      records: stream([{ id: 'nonsense' }, record('02d439m40'), record('05dxps055')]),
      release: 'v2.13',
    })
    expect(counts).toMatchObject({ read: 3, invalid: 1, failed: 1, created: 1 })
    expect(spies.logger.warn).toHaveBeenCalledOnce()
  })

  it('imports a record only once when the dump repeats it', async () => {
    const { payload } = fakePayload()
    const counts = await importRorRecords({
      payload,
      records: stream([record('05dxps055'), record('05dxps055')]),
      release: 'v2.13',
    })
    expect(counts).toMatchObject({ created: 1, unchanged: 1 })
  })

  it('reads the existing institutions page by page', async () => {
    const many = Array.from({ length: 12_000 }, (_, i) => ({
      id: i + 1,
      rorId: `id${i}`,
      rorLastModified: '2025-01-01',
      data: {},
    }))
    const { payload, spies } = fakePayload(many)
    await importRorRecords({ payload, records: stream([]), release: 'v2.13' })
    const pages = spies.find.mock.calls.filter(([args]) => args.collection === 'institutions')
    expect(pages).toHaveLength(3)
    expect(pages.every(([args]) => args.limit === 5_000)).toBe(true)
  })
})
