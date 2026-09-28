import type { Where } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The subfield reads must agree with the proxy (src/lib/detail-lookup.ts), which renders a hub
// whose `isActive` is unset: the subfield index links such a hub and the sitemaps list it once it
// has its introduction. `equals: true` would leave out NULL in SQL.

const find = vi.fn(async (_args: { collection: string; where: Where }) => ({ docs: [] }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('@payload-config', () => ({ default: {} }))

const { activeSubfields, subfieldsForIndexing } = await import('./records')

beforeEach(() => find.mockClear())

describe('subfield reads', () => {
  it.each([
    ['activeSubfields', () => activeSubfields('en')],
    ['subfieldsForIndexing', () => subfieldsForIndexing()],
  ])('%s counts an unset isActive as active, as the proxy does', async (_name, read) => {
    await read()
    const where = find.mock.calls[0]?.[0].where
    expect(where?.vocabulary).toEqual({ equals: 'subfield' })
    // Payload's Postgres adapter writes this as `is_active IS NULL OR is_active <> false`.
    expect(where?.isActive).toEqual({ not_equals: false })
  })
})
