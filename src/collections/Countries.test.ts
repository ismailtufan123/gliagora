import { describe, expect, it } from 'vitest'

import { Countries } from './Countries'
import { CountrySets } from './CountrySets'

const field = (fields: typeof Countries.fields, name: string) =>
  fields.find((f) => 'name' in f && f.name === name) as Record<string, unknown> | undefined

describe('Countries and CountrySets (PLAN §4.6)', () => {
  it('uses the ISO code as the ID of a country, so other records store "DE"', () => {
    expect(field(Countries.fields, 'id')).toMatchObject({ type: 'text', required: true })
  })

  it('localizes country names and set labels, required in English only', () => {
    for (const f of [field(Countries.fields, 'name'), field(CountrySets.fields, 'label')]) {
      expect(f).toMatchObject({ localized: true })
      const validate = f?.validate as (v: unknown, o: unknown) => unknown
      expect(validate('', { req: { locale: 'en' }, operation: 'update' })).not.toBe(true)
      expect(validate(undefined, { req: { locale: 'tr' }, operation: 'update' })).toBe(true)
    }
  })

  it('offers no Duplicate action, since a copy would repeat the code or slug', () => {
    expect(Countries.disableDuplicate).toBe(true)
    expect(CountrySets.disableDuplicate).toBe(true)
  })

  it('fills the fixed set slug back in when a version is restored', () => {
    const [restore] = CountrySets.hooks?.beforeValidate ?? []
    const data = restore?.({
      data: { label: 'EU' },
      operation: 'update',
      originalDoc: { id: 1, slug: 'eu27' },
      req: {},
    } as never)
    expect(data).toMatchObject({ slug: 'eu27' })
  })

  it('never deletes countries or sets, which other records refer to', () => {
    expect((Countries.access?.delete as () => boolean)()).toBe(false)
    expect((CountrySets.access?.delete as () => boolean)()).toBe(false)
  })

  it('requires every set to name its source and the date it was checked there', () => {
    expect(field(CountrySets.fields, 'sourceUrl')).toMatchObject({ required: true })
    expect(field(CountrySets.fields, 'lastVerifiedAt')).toMatchObject({ required: true })
  })

  it('keeps a set slug unique and fixed once saved', () => {
    const slug = field(CountrySets.fields, 'slug') as {
      unique?: boolean
      access?: { update?: () => boolean }
    }
    expect(slug.unique).toBe(true)
    expect(slug.access?.update?.()).toBe(false)
  })
})
