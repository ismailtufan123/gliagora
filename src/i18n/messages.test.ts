import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import tr from '../../messages/tr.json'

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function leaves(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  return Object.values(value as Record<string, unknown>).flatMap(leaves)
}

describe('messages', () => {
  it('have the same keys in every locale', () => {
    expect(keys(tr).sort()).toEqual(keys(en).sort())
  })

  it('have no empty strings', () => {
    for (const text of [...leaves(en), ...leaves(tr)]) expect(text.trim()).not.toBe('')
  })
})
