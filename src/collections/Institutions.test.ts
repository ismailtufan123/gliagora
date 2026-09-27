import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Institutions, ROR_IMPORT_CONTEXT, SHORT_ID_PATTERN, newShortId } from './Institutions'

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
    })
    expect(data.shortId).toBeUndefined()
  })

  it('does not call the ROR API during the import, which brings its own data', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await run({ rorId: '05dxps055', name: 'Caltech' }, { context: { [ROR_IMPORT_CONTEXT]: true } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('offers no Duplicate action, since a copy would repeat the ROR ID or short ID', () => {
    expect(Institutions.disableDuplicate).toBe(true)
  })

  it('makes short IDs from the ROR alphabet', () => {
    for (let i = 0; i < 200; i++) expect(newShortId()).toMatch(SHORT_ID_PATTERN)
  })
})
