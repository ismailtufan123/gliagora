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

describe('fixedFieldHooks with untilSet', () => {
  const once = fixedFieldHooks('data-requests', ['email', 'details'], { untilSet: true })
  const guardOnce = (data: Record<string, unknown>, original: Record<string, unknown>) =>
    once.beforeChange[0]!({
      data,
      operation: 'update',
      originalDoc: original,
      req: {},
    } as never)

  it('lets an empty field be filled in once', () => {
    expect(() => guardOnce({ email: 'someone@example.org' }, { email: null })).not.toThrow()
    expect(() => guardOnce({ details: 'Text' }, {})).not.toThrow()
  })

  it('refuses any change after that, also to empty', () => {
    const stored = { email: 'someone@example.org', details: 'Text' }
    expect(() => guardOnce({ email: 'other@example.org' }, stored)).toThrow()
    expect(() => guardOnce({ details: null }, stored)).toThrow()
    expect(() => guardOnce({ email: 'someone@example.org' }, stored)).not.toThrow()
  })
})
