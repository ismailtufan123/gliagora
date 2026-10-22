import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SOURCES_2026_10 } from './sources-2026-10'
import { SOURCES_2026_10_17 } from './sources-2026-10-17'
import { NEW_MANUAL } from './sources-2026-10-21'
import { SEVERAL_SITES, TO_MANUAL, WEEKLY } from './sources-2026-10-22'

// The migration 20261022_120000_sources_round_3 finds each source by the address an earlier seed or
// migration gave it: a mistyped address would change nothing, silently.

const adapters = readFileSync(
  new URL('../20261017_195000_sources_by_adapters.ts', import.meta.url),
  'utf8',
)
const seeded = new Set([
  ...SOURCES_2026_10.map((source) => source.url),
  ...SOURCES_2026_10_17.map((source) => source.url),
  ...NEW_MANUAL.map((source) => source.url),
])

describe("the third round's changes to sources (2026-10-22)", () => {
  it('names only addresses an earlier seed or migration gave', () => {
    for (const url of [...WEEKLY.urls, ...TO_MANUAL.map((source) => source.url)]) {
      expect(seeded, url).toContain(url)
    }
    for (const { url } of SEVERAL_SITES.sources) {
      expect(seeded.has(url) || adapters.includes(`'${url}'`), url).toBe(true)
    }
  })

  it('says why each source changes', () => {
    for (const source of TO_MANUAL) expect(source.note).toMatch(/^Manual since M7's third round/)
  })
})
