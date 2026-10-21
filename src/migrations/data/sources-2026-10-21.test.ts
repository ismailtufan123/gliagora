import { describe, expect, it } from 'vitest'

import { SOURCES_2026_10 } from './sources-2026-10'
import { DUKE_NUS, SOURCES_2026_10_17 } from './sources-2026-10-17'
import {
  ALLEN,
  ELSC,
  FIREWALLED,
  LEFT_OUT,
  NEW_MANUAL,
  SISSA,
  STANFORD,
  TERMS_READ,
  UBC,
  UCSF,
} from './sources-2026-10-21'

// The migration 20261021_130000_sources_round_2_findings finds each source by the address an
// earlier seed gave it: a mistyped address would change nothing, silently.

const seeded = new Set([
  ...SOURCES_2026_10.map((source) => source.url),
  ...SOURCES_2026_10_17.map((source) => source.url),
  DUKE_NUS.url,
])

describe("the second round's changes to sources (2026-10-21)", () => {
  it('names only addresses the earlier seeds gave', () => {
    for (const url of [
      LEFT_OUT.url,
      UCSF.url,
      ...FIREWALLED.map((source) => source.url),
      SISSA.url,
      ALLEN.url,
      STANFORD.url,
      ELSC.url,
      UBC.url,
      ...TERMS_READ.sources.map((source) => source.url),
    ]) {
      expect(seeded, url).toContain(url)
    }
  })

  it('adds manual sources with their terms, never one already there', () => {
    for (const source of NEW_MANUAL) {
      expect(seeded, source.url).not.toContain(source.url)
      expect(source.termsUrl ?? source.termsAutomation).toBeTruthy()
      expect(source.termsNote, source.key).toBeTruthy()
      expect(source.notes, source.key).toMatch(/link/i)
    }
    expect(new Set(NEW_MANUAL.map((source) => source.key)).size).toBe(NEW_MANUAL.length)
  })
})
