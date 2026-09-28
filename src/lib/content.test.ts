import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import { CONTENT_PAGES, formatDate } from './content'
import { renderContentFile } from './markdown'

describe('content pages', () => {
  for (const [key, page] of Object.entries(CONTENT_PAGES)) {
    it(`${key}: file exists, has no top-level heading, and has a title`, () => {
      const file = path.join(process.cwd(), 'content', page.file)
      expect(existsSync(file)).toBe(true)
      // The page renders the title as the only <h1>.
      expect(readFileSync(file, 'utf8')).not.toMatch(/^# /m)
      expect(page.path.startsWith(`/${page.locale}/`)).toBe(true)
      expect(page.path.endsWith('/')).toBe(true)
      expect(page.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Object.keys(en.pages)).toContain(page.messages)
    })
  }

  it('uses no italics until an italic font ships (PLAN §7.3; tools/fonts/README.md)', () => {
    for (const page of Object.values(CONTENT_PAGES)) {
      expect(renderContentFile(page.file), page.file).not.toContain('<em>')
    }
  })

  it('describes no form on the notice and takedown page, which links to the report form (M4.6)', () => {
    const read = (file: string) => readFileSync(path.join(process.cwd(), 'content', file), 'utf8')
    const separateForm = [
      /form on (?:our|the) \[?notice and takedown page/i,
      /notice and takedown form/i,
      /\{en: Notice and takedown\}(?:\]\([^)]*\))? sayfasındaki form/,
      // As its own entry in the list of public forms (terms of use).
      /^- Notice and takedown \(corrections and removals\);$/m,
    ]
    for (const page of Object.values(CONTENT_PAGES)) {
      for (const pattern of separateForm) expect(read(page.file), page.file).not.toMatch(pattern)
    }
    expect(read(CONTENT_PAGES.takedown.file)).not.toMatch(/form on this page/i)
  })

  it('formats dates without ambiguity', () => {
    expect(formatDate('2026-09-27', 'en')).toBe('27 September 2026')
    expect(formatDate('2026-09-27', 'tr')).toBe('27 Eylül 2026')
  })
})
