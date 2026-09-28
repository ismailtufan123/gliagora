import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SHORT_ID_PATTERN } from '@/lib/short-id'

import { Institutions, ROR_IMPORT_CONTEXT } from './Institutions'

const [prepare] = Institutions.hooks?.beforeValidate ?? []
const run = (
  data: Record<string, unknown>,
  { operation = 'create', originalDoc, context = {} }: Record<string, unknown> = {},
) =>
  prepare?.({ data, operation, originalDoc, context, req: {} } as never) as Promise<
    Record<string, unknown>
  >

const CALTECH = JSON.parse(
  readFileSync(
    new URL('../../tests/fixtures/ror/v2.13-2026-09-22-ror-data-sample.json', import.meta.url),
    'utf8',
  ),
)[0]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Institutions', () => {
  it('makes the slug from the name', async () => {
    const data = await run(
      { name: 'İstanbul Üniversitesi', rorId: '03a5qrr21' },
      {
        context: { [ROR_IMPORT_CONTEXT]: true },
      },
    )
    expect(data.slug).toBe('istanbul-universitesi')
  })

  it('gives an institution without a ROR ID a short ID and marks it as added by hand', async () => {
    const data = await run({ name: 'Example Neurotech Ltd' })
    expect(data.shortId).toMatch(SHORT_ID_PATTERN)
    expect(data.origin).toBe('manual')
  })

  it('keeps the short ID when an institution is edited', async () => {
    const data = await run(
      { name: 'Renamed Ltd' },
      { operation: 'update', originalDoc: { shortId: 'k3f9a', origin: 'manual', name: 'Old' } },
    )
    expect(data.shortId).toBeUndefined()
    expect(data.slug).toBe('renamed-ltd')
  })

  it('accepts a ROR ID as a full URL and stores the short form', async () => {
    const data = await run(
      { name: 'X', rorId: 'https://ror.org/05DXPS055' },
      { context: { [ROR_IMPORT_CONTEXT]: true } },
    )
    expect(data.rorId).toBe('05dxps055')
  })

  it('fills a new ROR institution from the ROR API when only its ID is entered', async () => {
    const fetchMock = vi.fn(async () => Response.json(CALTECH))
    vi.stubGlobal('fetch', fetchMock)
    const data = await run({ rorId: '05dxps055' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.ror.org/v2/organizations/05dxps055',
      expect.anything(),
    )
    expect(data).toMatchObject({
      name: 'California Institute of Technology',
      slug: 'california-institute-of-technology',
      country: 'US',
      city: 'Pasadena',
      origin: 'ror',
      rorLastModified: '2025-05-05',
      // From the coordinates the ROR API gave (D40).
      timeZone: 'America/Los_Angeles',
    })
    expect(data.shortId).toBeUndefined()
  })

  it('fills the time zone from the coordinates, also for the import (D40)', async () => {
    expect(await run({ name: 'Example Lab', lat: 41.0082, lng: 28.9784 })).toMatchObject({
      timeZone: 'Europe/Istanbul',
    })
    const imported = await run(
      { rorId: '05dxps055', name: 'Caltech', lat: 34.14778, lng: -118.14452 },
      { context: { [ROR_IMPORT_CONTEXT]: true } },
    )
    expect(imported.timeZone).toBe('America/Los_Angeles')
    expect((await run({ name: 'Example Lab' })).timeZone).toBeNull()
  })

  it("keeps an editor's time zone until the coordinates change (D40)", async () => {
    const originalDoc = {
      name: 'Example Lab',
      origin: 'manual',
      shortId: 'k3f9a',
      lat: 38.8794,
      lng: -6.9707,
      timeZone: 'Europe/Madrid',
    }
    const update = (data: Record<string, unknown>, saved: Record<string, unknown> = originalDoc) =>
      run({ ...saved, ...data }, { operation: 'update', originalDoc: saved })
    // The editor corrects it; later saves keep the correction.
    const corrected = await update({ timeZone: 'Europe/Lisbon' })
    expect(corrected.timeZone).toBe('Europe/Lisbon')
    const saved = { ...originalDoc, timeZone: 'Europe/Lisbon' }
    expect((await update({ name: 'Example Laboratory' }, saved)).timeZone).toBe('Europe/Lisbon')
    // New coordinates (an import that moved it, or an editor): the zone follows them.
    expect((await update({ lat: 52.52, lng: 13.405 }, saved)).timeZone).toBe('Europe/Berlin')
    // An emptied zone is filled in again.
    expect((await update({ timeZone: null }, saved)).timeZone).toBe('Europe/Madrid')
  })

  it('checks the time zone against the country, also a saved one (D40)', async () => {
    const pagoPago = { name: 'Example Lab', lat: -14.27806, lng: -170.7025 }
    // The borders alone give Samoa's zone, a day ahead of American Samoa's.
    // (The hook fills in the data it is given, so each call gets its own copy.)
    expect((await run({ ...pagoPago })).timeZone).toBe('Pacific/Apia')
    expect((await run({ ...pagoPago, country: 'AS' })).timeZone).toBe('Pacific/Pago_Pago')
    expect((await run({ ...pagoPago, country: { id: 'AS' } })).timeZone).toBe('Pacific/Pago_Pago')
    // A corrected country counts as a move: the zone follows it.
    const saved = {
      ...pagoPago,
      origin: 'manual',
      shortId: 'k3f9a',
      country: 'WS',
      timeZone: 'Pacific/Apia',
    }
    const corrected = await run(
      { ...saved, country: 'AS' },
      { operation: 'update', originalDoc: saved },
    )
    expect(corrected.timeZone).toBe('Pacific/Pago_Pago')
    // The country is read from the saved institution when the save leaves it out.
    const renamed = await run(
      { name: 'Example Laboratory', timeZone: null },
      { operation: 'update', originalDoc: { ...saved, country: 'AS', timeZone: null } },
    )
    expect(renamed.timeZone).toBe('Pacific/Pago_Pago')
  })

  it('does not call the ROR API during the import, which brings its own data', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await run({ rorId: '05dxps055', name: 'Caltech' }, { context: { [ROR_IMPORT_CONTEXT]: true } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives a short ID when the ROR ID field holds only spaces', async () => {
    const data = await run({ name: 'Example Lab', rorId: '   ' })
    expect(data.rorId).toBeNull()
    expect(data.shortId).toMatch(SHORT_ID_PATTERN)
    expect(data.origin).toBe('manual')
  })

  it('refuses to change or remove a saved ROR ID', async () => {
    const originalDoc = { rorId: '05dxps055', origin: 'ror', name: 'Caltech' }
    await expect(run({ rorId: null }, { operation: 'update', originalDoc })).rejects.toThrow()
    await expect(
      run({ rorId: '02h1nk258' }, { operation: 'update', originalDoc }),
    ).rejects.toThrow()
    await expect(
      run({ rorId: 'https://ror.org/05dxps055' }, { operation: 'update', originalDoc }),
    ).resolves.toMatchObject({ rorId: '05dxps055' })
  })

  it('makes an institution added by hand a ROR institution when it gets a ROR ID', async () => {
    const data = await run(
      { rorId: '05dxps055' },
      { operation: 'update', originalDoc: { name: 'Caltech', origin: 'manual', shortId: 'k3f9a' } },
    )
    expect(data.origin).toBe('ror')
  })

  it('explains when the ROR API cannot be reached, unless the editor filled in the name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('busy', { status: 503 })),
    )
    await expect(run({ rorId: '05dxps055' })).rejects.toThrow()
    await expect(run({ rorId: '05dxps055', name: 'Caltech' })).resolves.toMatchObject({
      name: 'Caltech',
      origin: 'ror',
    })
  })

  it('checks the coordinate ranges, and requires coordinates only when added by hand', () => {
    const lat = Institutions.fields
      .flatMap((f) => ('fields' in f ? f.fields : [f]))
      .find((f) => 'name' in f && f.name === 'lat') as {
      validate: (v: unknown, o: unknown) => unknown
    }
    expect(lat.validate(95, { data: { origin: 'ror' } })).not.toBe(true)
    expect(lat.validate(-45.5, { data: { origin: 'manual' } })).toBe(true)
    expect(lat.validate(null, { data: { origin: 'manual' } })).not.toBe(true)
    expect(lat.validate(null, { data: { origin: 'ror' } })).toBe(true)
  })

  it('lets signed-in editors delete only institutions added by hand', () => {
    const remove = Institutions.access?.delete as (args: { req: { user: unknown } }) => unknown
    expect(remove({ req: { user: { id: 1 } } })).toEqual({ origin: { equals: 'manual' } })
    expect(remove({ req: { user: null } })).toBe(false)
  })

  it('keeps an institution that jobs or job versions refer to, also for code that bypasses access control', async () => {
    const [keepReferenced] = Institutions.hooks?.beforeDelete ?? []
    const remove = (totalDocs: number, versions = 0) => {
      const count = vi.fn(async () => ({ totalDocs }))
      const countVersions = vi.fn(async () => ({ totalDocs: versions }))
      return keepReferenced?.({
        id: 5,
        req: { payload: { count, countVersions } },
        context: {},
      } as never)
    }
    await expect(remove(2)).rejects.toThrow('2 jobs refer to this institution')
    await expect(remove(1)).rejects.toThrow('A job refers to this institution')
    await expect(remove(0, 1)).rejects.toThrow(
      'Earlier versions of a job refer to this institution',
    )
    await expect(remove(0)).resolves.toBeUndefined()
  })

  it('offers no Duplicate action, since a copy would repeat the ROR ID or short ID', () => {
    expect(Institutions.disableDuplicate).toBe(true)
  })
})
