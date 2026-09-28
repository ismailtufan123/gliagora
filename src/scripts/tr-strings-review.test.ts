import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import en from '../../messages/en.json'
import tr from '../../messages/tr.json'
import { TURKISH_PAGES } from './tr-strings-review-areas'
import {
  DOC_FILE,
  buildReview,
  flatten,
  messageCell,
  missingPlaces,
  placeOf,
  repeatedPlaces,
  reviewDate,
  reviewDocument,
  unusedPlaces,
} from './tr-strings-review-doc'

const keys = flatten(en).map(([key]) => key)

/** The first line where two texts differ, or null. */
function firstDifference(committed: string, generated: string): string | null {
  const a = committed.split('\n')
  const b = generated.split('\n')
  for (let line = 0; line < Math.max(a.length, b.length); line++) {
    if (a[line] !== b[line]) {
      return `line ${line + 1}:\n  in the file:  ${a[line] ?? '(missing)'}\n  generated:    ${b[line] ?? '(missing)'}`
    }
  }
  return null
}

describe('Turkish strings review (docs/tr-strings-review.md, D40)', () => {
  it('describes where every key appears', () => {
    expect(
      missingPlaces(keys),
      'describe where these keys appear in src/scripts/tr-strings-review-areas.ts, then run pnpm tr:review',
    ).toEqual([])
  })

  it('describes no key that no longer exists, and each key in one area only', () => {
    expect(
      unusedPlaces(keys),
      'these descriptions in src/scripts/tr-strings-review-areas.ts match no key: remove or rename them',
    ).toEqual([])
    expect(repeatedPlaces()).toEqual([])
  })

  it('takes the longest matching key or prefix', () => {
    expect(placeOf('search.label')?.area.title).toBe('Header, menus and search box')
    expect(placeOf('search.error.title')?.area.title).toBe('Search page')
    expect(placeOf('footer.social.instagram')).toMatchObject({
      match: 'footer.social',
      shown: false,
    })
    expect(placeOf('footer.contact')).toMatchObject({ shown: true })
    // A Turkish page shows only its own code (TR) on the language button.
    expect(placeOf('locale.short.en')).toMatchObject({ match: 'locale.short.en', shown: false })
    expect(placeOf('locale.short.tr')).toMatchObject({ match: 'locale.short', shown: true })
    expect(placeOf('jobs.filters.regions.europe')?.match).toBe('jobs.filters.regions')
    expect(placeOf('jobs.filtersX')).toBeUndefined()
  })

  it('knows which Turkish pages exist, since that decides what is shown on the Turkish site', () => {
    const folder = fileURLToPath(new URL('../app/(frontend)/tr/', import.meta.url))
    const pages = readdirSync(folder, { recursive: true, encoding: 'utf8' })
      .filter((file) => path.basename(file) === 'page.tsx')
      .map((file) => `/tr/${path.dirname(file).split(path.sep).join('/')}/`)
    expect(
      pages.sort(),
      'a Turkish page was added or removed: update TURKISH_PAGES and the `shown` flags in src/scripts/tr-strings-review-areas.ts, then run pnpm tr:review',
    ).toEqual([...TURKISH_PAGES].sort())
  })

  it('is up to date with the messages', async () => {
    const committed = readFileSync(DOC_FILE, 'utf8')
    const date = reviewDate(committed)
    expect(date, 'the file names no date: run pnpm tr:review').not.toBeNull()
    const generated = await reviewDocument({ en, tr, date: date as string })
    expect(
      firstDifference(committed, generated),
      'docs/tr-strings-review.md is out of date: run pnpm tr:review',
    ).toBeNull()
  })

  it('lists every string once, with its Turkish text, in one table', () => {
    const doc = buildReview({ en, tr, date: '2026-09-28' })
    const lines = doc.split('\n')
    const rows = lines.filter((line) => /^\| [^|]+ \| `[^`]+` \|/.test(line))
    expect(rows).toHaveLength(keys.length)
    expect(
      lines.filter((line) => line.startsWith('| ---')),
      'one table only',
    ).toHaveLength(1)
    expect(doc).toContain(`Updated 2026-09-28: ${keys.length} strings`)
    expect(doc).toContain(
      '| 1. Header, menus and search box | `a11y.skipLink` | Skip to main content | Ana içeriğe geç |',
    )
    expect(reviewDate(doc)).toBe('2026-09-28')
  })

  it('fails without a Turkish text for a key', () => {
    const { skipLink: _, ...a11y } = tr.a11y
    expect(() => buildReview({ en, tr: { ...tr, a11y }, date: '2026-09-28' })).toThrow(
      /a11y\.skipLink/,
    )
  })
})

describe('Markdown of a message', () => {
  it('keeps placeholders, tags and plural blocks exactly, in code spans', () => {
    expect(messageCell('Closes {date}')).toBe('Closes `{date}`')
    expect(messageCell('See <link>all positions</link>.')).toBe(
      'See `<link>`all positions`</link>`.',
    )
    expect(messageCell('<strong>About:</strong> <link>{title}</link>')).toBe(
      '`<strong>`About:`</strong>` `<link>{title}</link>`',
    )
    expect(messageCell('{days, plural, one {# day left} other {# days left}}')).toBe(
      '`{days, plural, one {# day left} other {# days left}}`',
    )
  })

  it('keeps each string in its table cell', () => {
    expect(messageCell('{title} – Gliagora | Neuroscience')).toBe(
      '`{title}` – Gliagora \\| Neuroscience',
    )
    expect(messageCell('{a, select, x {1 | 2} other {3}}')).toBe(
      '`{a, select, x {1 \\| 2} other {3}}`',
    )
    expect(messageCell('One\ntwo')).toBe('One<br>two')
    expect(messageCell('A <b>c</b> * _d_ [e] `f`')).toBe(
      'A `<b>`c`</b>` \\* \\_d\\_ \\[e\\] \\`f\\`',
    )
  })
})
