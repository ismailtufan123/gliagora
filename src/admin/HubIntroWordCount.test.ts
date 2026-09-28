import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The form state the admin would hold: the hub introduction being edited, at its path, in the
// locale chosen in the admin.
const form = vi.hoisted(() => ({
  fields: {} as Record<string, { value?: unknown }>,
  locale: 'en',
}))
vi.mock('@payloadcms/ui', () => ({
  useFormFields: <T>(selector: (context: [typeof form.fields]) => T) => selector([form.fields]),
  useLocale: () => ({ code: form.locale }),
}))

import { HubIntroWordCount, wordCountNote } from './HubIntroWordCount'

const render = (value: unknown, locale = 'en') => {
  form.fields = { hubIntro: { value } }
  form.locale = locale
  return renderToStaticMarkup(createElement(HubIntroWordCount, { path: 'hubIntro' }))
}

describe('HubIntroWordCount (the hub introduction in the admin)', () => {
  it('says how many words are missing before search engines list the hub (D40)', () => {
    const en = (count: number) => wordCountNote(count, 'en')
    expect(en(0)).toBe('0 words: 150 more words before search engines list this hub.')
    expect(en(1)).toBe('1 word: 149 more words before search engines list this hub.')
    expect(en(149)).toBe('149 words: 1 more word before search engines list this hub.')
    expect(en(150)).toBe('150 words: long enough for search engines to list this hub.')
    expect(en(301)).toBe('301 words: long enough for search engines to list this hub.')
  })

  it('says in another locale that only the English introduction decides (hubs are English only)', () => {
    const note =
      '160 words. Only the English introduction decides whether search engines list this hub (at least 150 words).'
    expect(wordCountNote(160, 'tr')).toBe(note)
    expect(render('kelime '.repeat(160), 'tr')).toBe(`<div class="field-description">${note}</div>`)
    expect(render('kelime '.repeat(160), 'tr')).not.toContain('long enough')
    expect(render('kelime '.repeat(10), 'tr')).not.toContain('more words')
    // Without a locale (an admin without localization), it makes no promise either.
    expect(wordCountNote(160, undefined)).toBe(note)
  })

  it('counts the text being edited as the robots rule does', () => {
    expect(render("Glia — Türkiye'nin\n\nwell-known  cells.")).toBe(
      '<div class="field-description">4 words: 146 more words before search engines list this hub.</div>',
    )
    expect(render(undefined)).toContain('0 words')
    expect(render(null)).toContain('0 words')
    expect(render('glia '.repeat(150))).toContain('150 words: long enough')
  })
})
