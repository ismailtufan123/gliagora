import { describe, expect, it } from 'vitest'

import { CONTENT_PAGES } from './content'
import {
  HUB_INTRO_MIN_WORDS,
  contentPageIndexed,
  countWords,
  hubIndexed,
  institutionIndexed,
  jobIndexed,
  jobsListIndexed,
  subfieldIndexIndexed,
} from './indexing'

// The robots rules the pages and the sitemaps share (PLAN §2.2, §2.5, §16.1).

/** `n` words over a few sentences, as an introduction has them. */
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => (i % 12 === 11 ? `glia${i}.` : `glia${i}`)).join(' ')

describe('indexing rules', () => {
  it('index content pages only once they leave draft (D28)', () => {
    expect(contentPageIndexed({ draft: true })).toBe(false)
    expect(contentPageIndexed({ draft: false })).toBe(true)
    expect(contentPageIndexed(CONTENT_PAGES.about)).toBe(true)
    // Each text by its own flag, so approving one (draft: false) needs no change here.
    for (const page of Object.values(CONTENT_PAGES)) {
      expect(contentPageIndexed(page), page.path).toBe(!page.draft)
    }
  })

  it('index the jobs list only unfiltered, on its first page', () => {
    const query = (search: string) => new URLSearchParams(search)
    expect(jobsListIndexed(query(''))).toBe(true)
    // Defaults and campaign tags are not filters (the canonical link names the list itself).
    expect(jobsListIndexed(query('sort=deadline&view=list&page=1'))).toBe(true)
    expect(jobsListIndexed(query('utm_source=newsletter'))).toBe(true)
    for (const search of [
      'type=phd',
      'subfield=glia&type=phd',
      'page=2',
      'sort=newest',
      'view=map',
      'q=astrocytes',
      'deadline=14d',
      // A range with a mistake, shown again with the error.
      'deadline=range&deadline-from=2026-12-01&deadline-to=2026-10-01',
    ]) {
      expect(jobsListIndexed(query(search)), search).toBe(false)
    }
  })

  it('index a job only while it is open (PLAN §2.5)', () => {
    expect(jobIndexed('open')).toBe(true)
    for (const state of ['closed', 'gone', 'hidden'] as const) expect(jobIndexed(state)).toBe(false)
  })

  it('index an institution only with at least one open position', () => {
    expect(institutionIndexed(0)).toBe(false)
    expect(institutionIndexed(1)).toBe(true)
    expect(institutionIndexed(12)).toBe(true)
  })

  it('index a hub only once its introduction has at least 150 words (D40)', () => {
    expect(HUB_INTRO_MIN_WORDS).toBe(150)
    expect(hubIndexed({})).toBe(false)
    expect(hubIndexed({ hubIntro: null })).toBe(false)
    expect(hubIndexed({ hubIntro: ' \n\n ' })).toBe(false)
    // A short introduction is shown on the hub, but does not make it indexed.
    expect(hubIndexed({ hubIntro: 'Glia are the other half of the brain.' })).toBe(false)
    expect(hubIndexed({ hubIntro: words(149) })).toBe(false)
    expect(hubIndexed({ hubIntro: words(150) })).toBe(true)
    expect(hubIndexed({ hubIntro: words(300) })).toBe(true)
    // Punctuation and dashes add no words; paragraphs and extra white space change nothing.
    expect(hubIndexed({ hubIntro: `${words(149)} — … !! – ?` })).toBe(false)
    expect(hubIndexed({ hubIntro: `${words(75)}\n\n\n   ${words(74)}\t\n` })).toBe(false)
    expect(hubIndexed({ hubIntro: `${words(75)}\n\n${words(75)}` })).toBe(true)
    // Emoji add no words, also with a variation selector (a combining mark).
    expect(hubIndexed({ hubIntro: '❤\uFE0F '.repeat(150) })).toBe(false)
    expect(hubIndexed({ hubIntro: `${words(149)} ✔\uFE0F ⚠\uFE0F` })).toBe(false)
  })

  it('index the subfield index with its first indexed hub', () => {
    expect(subfieldIndexIndexed([])).toBe(false)
    expect(subfieldIndexIndexed([{ hubIntro: null }, { hubIntro: '' }])).toBe(false)
    expect(subfieldIndexIndexed([{ hubIntro: null }, { hubIntro: 'Intro' }])).toBe(false)
    expect(subfieldIndexIndexed([{ hubIntro: words(149) }, { hubIntro: words(150) }])).toBe(true)
  })
})

describe('countWords', () => {
  it('counts runs of letters or digits, whatever the white space between them', () => {
    expect(countWords(undefined)).toBe(0)
    expect(countWords(null)).toBe(0)
    expect(countWords('')).toBe(0)
    expect(countWords(' \n\t ')).toBe(0)
    expect(countWords('Glia are the other half of the brain.')).toBe(8)
    expect(countWords('  Glia   are\tthe\u00A0other half ')).toBe(5)
    // Paragraphs, separated by blank lines as in the hub introduction.
    expect(countWords('Astrocytes shape synapses.\n\nMicroglia prune them.\n\n\n')).toBe(6)
    expect(countWords('In 2026, 12 labs')).toBe(4)
  })

  it('does not count punctuation, dashes or symbols on their own', () => {
    expect(countWords('— … !! – ? * / & () “” 🧠')).toBe(0)
    expect(countWords('Glia — not glue — matter.')).toBe(4)
    expect(countWords('glia/neuron (2020–2026)')).toBe(4)
    expect(countWords('"Quoted," she said; \'single\' too.')).toBe(5)
    // Emoji written with a variation selector (U+FE0F, a combining mark), and an accent with no
    // letter before it.
    expect(countWords('❤\uFE0F ✔\uFE0F ⚠\uFE0F ☀\uFE0F')).toBe(0)
    expect(countWords('a \u0301 b')).toBe(2)
    // A digit keeps its marks: a keycap digit is one word.
    expect(countWords('1\uFE0F\u20E3')).toBe(1)
  })

  it('splits at other punctuation, so abbreviations, URLs and e-mail addresses count per run', () => {
    expect(countWords('e.g. i.e.')).toBe(4)
    expect(countWords('neuron/glia 10:30')).toBe(4)
    expect(countWords('info@example.org')).toBe(3)
    expect(countWords('https://glia.example/path')).toBe(4)
  })

  it('keeps words with an inner apostrophe or hyphen, and numbers, as one word', () => {
    expect(countWords("Türkiye'nin")).toBe(1)
    expect(countWords('Türkiye’nin İstanbul’daki')).toBe(2)
    expect(countWords("don't well-known state-of-the-art")).toBe(3)
    expect(countWords('non\u2011invasive neuro\u00ADscience')).toBe(2)
    expect(countWords('3.5 T and 1,000 cells')).toBe(5)
    // A hyphen or apostrophe at the edge of a word is not part of it.
    expect(countWords("- item 'glia' -- end-")).toBe(3)
  })

  it('reads Turkish and other letters as letters', () => {
    expect(countWords('Işık, ığdır, şişe, ÇAĞRI, İSTANBUL, öğrenci, ülke')).toBe(7)
    expect(countWords('Beyin ve sinir bilimi: glia hücreleri.')).toBe(6)
    // Accents written as combining marks stay in their word.
    expect(countWords('Gene\u0300ve Zu\u0308rich')).toBe(2)
    expect(countWords('Nöroloji Genève Kraków São Paulo')).toBe(5)
  })
})
