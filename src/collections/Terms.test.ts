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

  it('rejects a slug or vocabulary change even when access control is bypassed', () => {
    const [hook] = Terms.hooks?.beforeChange ?? []
    const originalDoc = { id: 1, vocabulary: 'model-system', slug: 'rodent' }
    const run = (data: Record<string, unknown>) =>
      hook?.({ data, originalDoc, operation: 'update', req: {} } as never)
    expect(() => run({ slug: 'rodents' })).toThrow()
    expect(() => run({ vocabulary: 'method' })).toThrow()
    expect(run({ slug: 'rodent', label: 'Rodents' })).toEqual({ slug: 'rodent', label: 'Rodents' })
  })

  it('localizes the label, description and hub introduction (PLAN §12)', () => {
    for (const name of ['label', 'description', 'hubIntro']) {
      expect(field(name)).toMatchObject({ localized: true })
    }
    expect(field('slug')).not.toHaveProperty('localized')
  })

  it('keeps every change as a version (the changelog in PLAN §4.1)', () => {
    expect(Terms.versions).toBeTruthy()
  })
})
