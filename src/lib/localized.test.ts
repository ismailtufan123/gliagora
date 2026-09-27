import { describe, expect, it } from 'vitest'

import { requiredInEnglish } from './localized'

const validate = requiredInEnglish('Enter the English label.')
const run = (value: string | undefined, locale: string, operation: 'create' | 'update') =>
  validate(value, { req: { locale }, operation } as never)

describe('requiredInEnglish', () => {
  it('requires a value in English', () => {
    expect(run('Rodents', 'en', 'update')).toBe(true)
    expect(run('', 'en', 'update')).toBe('Enter the English label.')
    expect(run('  ', 'en', 'create')).toBe('Enter the English label.')
    expect(run(undefined, 'en', 'create')).toBe('Enter the English label.')
  })

  it('lets a Turkish value stay empty, so it falls back to English', () => {
    expect(run(undefined, 'tr', 'update')).toBe(true)
    expect(run('Kemirgenler', 'tr', 'update')).toBe(true)
  })

  it('asks for new documents to be created in English first', () => {
    expect(run('Kemirgenler', 'tr', 'create')).toMatch(/English/)
  })
})
