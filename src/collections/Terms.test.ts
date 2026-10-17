import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { signedInField } from '@/lib/access'

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

  it('localizes the label, description, hub introduction and its draft (PLAN §12)', () => {
    for (const name of ['label', 'description', 'hubIntro', 'hubIntroDraft']) {
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

  it('tells editors that a hub is listed from 150 words, and shows the count (D40)', () => {
    const admin = (
      field('hubIntro') as { admin: { description: string; components: { afterInput: string[] } } }
    ).admin
    expect(admin.description).toContain('English introduction has at least 150 words')
    expect(admin.description).toContain('noindex')
    // The component must be in the committed import map (pnpm generate:importmap), or the admin
    // leaves it out without an error.
    const importMap = readFileSync(
      new URL('../app/(payload)/admin/importMap.js', import.meta.url),
      'utf8',
    )
    for (const component of admin.components.afterInput) {
      expect(importMap).toContain(`"${component}"`)
    }
  })

  it('keeps the AI draft of the introduction for editors only (D53)', () => {
    const draft = field('hubIntroDraft') as {
      access: Record<string, unknown>
      admin: { description: string; condition: (data: unknown) => boolean }
    }
    expect(draft.access).toEqual({
      read: signedInField,
      create: signedInField,
      update: signedInField,
    })
    expect(draft.admin.condition({ vocabulary: 'subfield' })).toBe(true)
    expect(draft.admin.condition({ vocabulary: 'method' })).toBe(false)
    expect(draft.admin.description).toContain('never shown on the site')
    // The introduction's own description no longer calls it human-written: it may start from the
    // draft, but only it is shown and counted.
    const intro = (field('hubIntro') as { admin: { description: string } }).admin.description
    expect(intro).not.toMatch(/human-written/i)
    expect(intro).toContain('only this text is shown on the site')
  })

  it('reads the AI draft nowhere but in the admin (D53)', () => {
    // The public pages read subfields with their own `select` and raw SQL with named columns, so a
    // new field stays out of them; this keeps it so. Allowed: this collection, the generated types,
    // the migrations and their data, and tests.
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const allowed = [
      path.join(src, 'collections', 'Terms.ts'),
      path.join(src, 'payload-types.ts'),
      path.join(src, 'migrations'),
    ]
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name)
        if (allowed.some((skip) => full === skip || full.startsWith(skip + path.sep))) return []
        if (statSync(full).isDirectory()) return files(full)
        return /\.(tsx?|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
      })
    const readers = files(src).filter((file) =>
      /hubIntroDraft|hub_intro_draft/.test(readFileSync(file, 'utf8')),
    )
    expect(readers.map((file) => path.relative(src, file))).toEqual([])
  })

  it('keeps every change as a version (the changelog in PLAN §4.1)', () => {
    expect(Terms.versions).toBeTruthy()
  })
})
