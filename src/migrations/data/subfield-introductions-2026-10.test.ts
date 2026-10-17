import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { countWords } from '@/lib/indexing'

import { SUBFIELD_INTRODUCTIONS_2026_10 as INTRODUCTIONS } from './subfield-introductions-2026-10'
import { TAXONOMY_2026_09 } from './taxonomy-2026-09'

// The AI drafts of the hub introductions (D53): one per subfield of PLAN §4.2, 170–250 words
// (indexing counts 150, D40, so the editor has room to shorten), plain prose, and the readable
// copy in docs/subfield-introductions.md with the same texts. WRITE_DOC=1 rewrites that copy.

const here = path.dirname(fileURLToPath(import.meta.url))
const DOC = path.resolve(here, '../../../docs/subfield-introductions.md')

const SUBFIELDS = TAXONOMY_2026_09.filter((term) => term.vocabulary === 'subfield')

/** docs/subfield-introductions.md as the data makes it. */
function document(): string {
  const sections = INTRODUCTIONS.map(
    ({ slug, label, text }) =>
      `## ${label}\n\n\`${slug}\`, ${countWords(text)} words\n\n${text}\n`,
  )
  return `# Subfield introductions: AI drafts (D53)

First drafts of the English introductions of the 19 subfield hubs (PLAN §4.2, §16.3), written on 2026-10-17 with an AI assistant (Claude Code) from the taxonomy alone: no personal data, no sources, no names of people or laboratories, and no medical advice (D19). Each is 170–250 words; a hub is indexed once its introduction has at least 150 (D40), so there is room to shorten.

The site never shows these drafts. A migration copies each into its subfield's field "AI draft of the introduction" in the admin (Taxonomy → Terms), which only editors see. The hub shows, and search engines count, only "Hub introduction", which stays empty until the editor writes her own introduction from the draft and saves it (\`docs/editor-guide-tr.md\`, section 7).

Generated from \`src/migrations/data/subfield-introductions-2026-10.ts\`; a test checks that the two agree (\`WRITE_DOC=1 pnpm vitest run src/migrations/data/subfield-introductions-2026-10.test.ts\` rewrites this file).

${sections.join('\n')}`
}

describe('the AI drafts of the hub introductions (D53)', () => {
  it('cover the 19 subfields of PLAN §4.2, in order, with their labels', () => {
    expect(INTRODUCTIONS.map(({ slug, label }) => ({ slug, label }))).toEqual(
      SUBFIELDS.map(({ slug, label }) => ({ slug, label })),
    )
  })

  it.each(INTRODUCTIONS)('$slug has 170 to 250 words', ({ text }) => {
    const words = countWords(text)
    expect(words).toBeGreaterThanOrEqual(170)
    expect(words).toBeLessThanOrEqual(250)
  })

  it.each(INTRODUCTIONS)('$slug is plain prose in paragraphs', ({ text }) => {
    // Paragraphs separated by one blank line, as the hub page splits them; no links, addresses,
    // markup or figures (a figure would be a claim that needs a source).
    expect(text).toBe(text.trim())
    expect(text).not.toMatch(/\n\n\n|[ \t]\n|\n[ \t]/)
    expect(text.split('\n\n').length).toBeGreaterThanOrEqual(2)
    expect(text).not.toMatch(/https?:|www\.|@|[<>*_#[\]`]|\d/)
  })

  it('name only real hubs as related hubs', () => {
    const labels = new Set(SUBFIELDS.map(({ label }) => label))
    for (const { slug, label, text } of INTRODUCTIONS) {
      const related = /Related hubs: (.+)\.$/.exec(text)?.[1]
      expect(related, slug).toBeDefined()
      const names = related!.split(/, (?:and )?(?=[A-Z])/).map((name) => name.trim())
      expect(names.length, slug).toBeGreaterThanOrEqual(3)
      for (const name of names) expect(labels, `${slug}: ${name}`).toContain(name)
      expect(names, slug).not.toContain(label)
    }
  })

  it('are copied into docs/subfield-introductions.md', () => {
    if (process.env.WRITE_DOC === '1') writeFileSync(DOC, document())
    expect(readFileSync(DOC, 'utf8')).toBe(document())
  })
})
