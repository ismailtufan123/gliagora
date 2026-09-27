import { describe, expect, it } from 'vitest'

import { createsCycle, isValidSlug, withDescendants } from './taxonomy'

describe('isValidSlug', () => {
  it.each(['glia', 'systems-circuits', 'c-elegans', 'mri-fmri', 'ipsc-organoids'])(
    'accepts %s',
    (slug) => expect(isValidSlug(slug)).toBe(true),
  )

  it.each(['', 'Glia', 'systems_circuits', '-glia', 'glia-', 'two--hyphens', 'glía', 'a b'])(
    'rejects %j',
    (slug) => expect(isValidSlug(slug)).toBe(false),
  )
})

describe('withDescendants', () => {
  // rodent → mouse, rat (PLAN §4.4), plus a grandchild to check depth.
  const terms = [
    { id: 1, parent: null },
    { id: 2, parent: 1 },
    { id: 3, parent: 1 },
    { id: 4, parent: 2 },
    { id: 5 },
  ]

  it('includes children and grandchildren of a parent', () => {
    expect(withDescendants([1], terms).sort()).toEqual([1, 2, 3, 4])
  })

  it('keeps a leaf as it is', () => {
    expect(withDescendants([3], terms)).toEqual([3])
  })

  it('does not list a term twice when a parent and its child are both selected', () => {
    expect(withDescendants([2, 1], terms).sort()).toEqual([1, 2, 3, 4])
  })

  it('returns nothing for an empty selection', () => {
    expect(withDescendants([], terms)).toEqual([])
  })
})

describe('createsCycle', () => {
  const parents = new Map<number, number | null>([
    [1, null],
    [2, 1],
    [3, 2],
  ])
  const parentOf = (id: number) => parents.get(id)

  it('allows a parent that is not a descendant', async () => {
    expect(await createsCycle(4, 3, parentOf)).toBe(false)
  })

  it('rejects the term itself as parent', async () => {
    expect(await createsCycle(2, 2, parentOf)).toBe(true)
  })

  it('rejects a descendant as parent', async () => {
    expect(await createsCycle(1, 3, parentOf)).toBe(true)
  })

  it('stops on a loop that is already in the data', async () => {
    const looped = new Map([
      [7, 8],
      [8, 7],
    ])
    expect(await createsCycle(9, 7, (id) => looped.get(id))).toBe(true)
  })
})
