import { describe, expect, it } from 'vitest'

import { fixedFieldHooks } from './fixed-fields'

const hooks = fixedFieldHooks('terms', ['vocabulary', 'slug'])
const originalDoc = { id: 1, vocabulary: 'model-system', slug: 'rodent', label: 'Rodents' }

const restore = (data: Record<string, unknown>, operation = 'update') =>
  hooks.beforeValidate[0]!({ data, operation, originalDoc, req: {} } as never)
const guard = (data: Record<string, unknown>) =>
  hooks.beforeChange[0]!({ data, operation: 'update', originalDoc, req: {} } as never)

describe('fixedFieldHooks', () => {
  it('fills fixed fields back in when an update leaves them out, as a version restore does', () => {
    expect(restore({ label: 'Rodents (old)' })).toEqual({
      label: 'Rodents (old)',
      vocabulary: 'model-system',
      slug: 'rodent',
    })
  })

  it('leaves new documents alone', () => {
    expect(restore({ slug: 'mouse' }, 'create')).toEqual({ slug: 'mouse' })
  })

  it('refuses a change to a fixed field, even when access control is bypassed', () => {
    expect(() => guard({ slug: 'rodents' })).toThrow()
    expect(() => guard({ vocabulary: 'method' })).toThrow()
  })

  it('accepts updates that keep the fixed fields', () => {
    expect(guard({ slug: 'rodent', label: 'Rodents' })).toEqual({
      slug: 'rodent',
      label: 'Rodents',
    })
    expect(guard({ label: 'Rodents' })).toEqual({ label: 'Rodents' })
  })
})
