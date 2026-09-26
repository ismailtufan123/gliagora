import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import tr from '../../messages/tr.json'
import type { Locale } from './routing'

const locales: Record<Locale, typeof en> = { en, tr }

function entries(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix, value]]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    entries(child, prefix ? `${prefix}.${key}` : key),
  )
}

// Placeholders ({title}) and rich-text tags (<email>) a message expects its caller to fill in.
function slots(text: string) {
  const names = [...text.matchAll(/\{\s*(\w+)|<(\w+)>/g)].map((m) => m[1] ?? `<${m[2]}>`)
  return [...new Set(names)].sort()
}

const english = new Map(entries(en))

describe('messages', () => {
  it('have the same keys in every locale', () => {
    for (const messages of Object.values(locales)) {
      expect(
        entries(messages)
          .map(([key]) => key)
          .sort(),
      ).toEqual([...english.keys()].sort())
    }
  })

  it('have no empty strings', () => {
    for (const messages of Object.values(locales)) {
      for (const [key, text] of entries(messages)) expect(text.trim(), key).not.toBe('')
    }
  })

  it('use the same placeholders and tags in every locale', () => {
    for (const messages of Object.values(locales)) {
      for (const [key, text] of entries(messages)) {
        expect(slots(text), key).toEqual(slots(english.get(key) ?? ''))
      }
    }
  })

  it('are valid ICU messages', () => {
    for (const locale of Object.keys(locales) as Locale[]) {
      const messages = locales[locale]
      const t = createTranslator({
        locale,
        messages,
        onError: (error) => {
          throw error
        },
      })
      for (const [key, text] of entries(messages)) {
        const values = Object.fromEntries(
          slots(text).map((slot) =>
            slot.startsWith('<') ? [slot.slice(1, -1), (chunks: string) => chunks] : [slot, 'x'],
          ),
        )
        const format = () => t.markup(key as Parameters<typeof t.markup>[0], values)
        expect(format, `${locale}: ${key}`).not.toThrow()
      }
    }
  })
})
