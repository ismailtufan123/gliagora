import { describe, expect, it } from 'vitest'

import { RetiredListings } from './RetiredListings'

describe('RetiredListings', () => {
  it('is read by signed-in editors only, and changed by nobody through the API or the admin', () => {
    const access = RetiredListings.access ?? {}
    expect(access.read?.({ req: { user: { id: 1 } } } as never)).toBe(true)
    expect(access.read?.({ req: { user: null } } as never)).toBe(false)
    expect(access.create?.({} as never)).toBe(false)
    expect(access.update?.({} as never)).toBe(false)
    expect(access.delete?.({} as never)).toBe(false)
  })

  it('refuses changes and deletes also from code that bypasses access control', async () => {
    const [writeOnce] = RetiredListings.hooks?.beforeChange ?? []
    const data = { kind: 'job', shortId: 'k3f9a', slug: 'phd', retiredAt: '2026-10-15' }
    expect(await writeOnce?.({ operation: 'create', data } as never)).toEqual(data)
    expect(() => writeOnce?.({ operation: 'update', data } as never)).toThrow(/never changed/)
    const [keep] = RetiredListings.hooks?.beforeDelete ?? []
    expect(() => keep?.({ id: 1 } as never)).toThrow(/410/)
  })

  it('keeps each short ID once', () => {
    const shortId = RetiredListings.fields.find((f) => 'name' in f && f.name === 'shortId')
    expect(shortId).toMatchObject({ unique: true, required: true, index: true })
  })
})
