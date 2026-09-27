import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { Terms } from './Terms'

const field = (name: string) =>
  Terms.fields.find((f): f is Field & { name: string } => 'name' in f && f.name === name)

describe('Terms (taxonomy)', () => {
  it('makes a slug unique within its vocabulary (PLAN §4.1)', () => {
    expect(Terms.indexes).toContainEqual({ fields: ['vocabulary', 'slug'], unique: true })
  })

  it('never deletes a term; terms are deactivated instead', () => {
    const remove = Terms.access?.delete as () => boolean
    expect(remove()).toBe(false)
  })

  it('shows slug and vocabulary read-only once saved', () => {
    for (const name of ['slug', 'vocabulary']) {
      const update = (field(name) as { access?: { update?: () => boolean } }).access?.update
      expect(update?.()).toBe(false)
    }
  })

  it('keeps slug and vocabulary fixed, also when a version is restored', () => {
    const [restore] = Terms.hooks?.beforeValidate ?? []
    const [guard] = Terms.hooks?.beforeChange ?? []
    const originalDoc = { id: 1, vocabulary: 'model-system', slug: 'rodent' }
    const args = (data: Record<string, unknown>) =>
      ({ data, originalDoc, operation: 'update', req: {} }) as never
    expect(restore?.(args({ label: 'Rodents' }))).toMatchObject({ slug: 'rodent' })
    expect(() => guard?.(args({ slug: 'rodents' }))).toThrow()
  })

  it('offers no Duplicate action, since a copy would repeat the slug', () => {
    expect(Terms.disableDuplicate).toBe(true)
  })

  it('localizes the label, description and hub introduction (PLAN §12)', () => {
    for (const name of ['label', 'description', 'hubIntro']) {
      expect(field(name)).toMatchObject({ localized: true })
    }
    expect(field('slug')).not.toHaveProperty('localized')
  })

  it('requires the label in English only', () => {
    const validate = (field('label') as { validate: (v: unknown, o: unknown) => unknown }).validate
    expect(validate('', { req: { locale: 'en' }, operation: 'update' })).not.toBe(true)
    expect(validate(undefined, { req: { locale: 'tr' }, operation: 'update' })).toBe(true)
  })

  it('refuses parent values that are not term IDs, before looking anything up', async () => {
    const validate = (field('parent') as { validate: (v: unknown, o: unknown) => unknown }).validate
    for (const value of ['abc', 1.5, -3]) {
      expect(await validate(value, { data: {}, req: {} })).toBe(
        'Choose a parent term from the list.',
      )
    }
    expect(await validate(null, { data: {}, req: {} })).toBe(true)
  })

  it('checks mapping IDs, and refuses a single string instead of a list', () => {
    const mappings = field('mappings') as unknown as {
      fields: { name: string; validate: (v: unknown) => unknown }[]
    }
    const mesh = mappings.fields.find((f) => f.name === 'mesh')!.validate
    expect(mesh(['D009457'])).toBe(true)
    expect(mesh(['9457'])).not.toBe(true)
    expect(mesh('D009457')).not.toBe(true)
    expect(mesh(null)).toBe(true)
  })

  it('keeps every change as a version (the changelog in PLAN §4.1)', () => {
    expect(Terms.versions).toBeTruthy()
  })
})
