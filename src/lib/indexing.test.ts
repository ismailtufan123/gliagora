import { describe, expect, it } from 'vitest'

import { CONTENT_PAGES } from './content'
import {
  contentPageIndexed,
  hubIndexed,
  institutionIndexed,
  jobIndexed,
  jobsListIndexed,
  subfieldIndexIndexed,
} from './indexing'

// The robots rules the pages and the sitemaps share (PLAN §2.2, §2.5, §16.1).

describe('indexing rules', () => {
  it('index content pages only once they leave draft (D28)', () => {
    expect(contentPageIndexed({ draft: true })).toBe(false)
    expect(contentPageIndexed({ draft: false })).toBe(true)
    expect(contentPageIndexed(CONTENT_PAGES.about)).toBe(true)
    expect(contentPageIndexed(CONTENT_PAGES.privacy)).toBe(false)
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

  it('index a hub once it has its written introduction, and the index with the first such hub', () => {
    expect(hubIndexed({})).toBe(false)
    expect(hubIndexed({ hubIntro: null })).toBe(false)
    expect(hubIndexed({ hubIntro: ' \n\n ' })).toBe(false)
    expect(hubIndexed({ hubIntro: 'Glia are the other half of the brain.' })).toBe(true)
    expect(subfieldIndexIndexed([])).toBe(false)
    expect(subfieldIndexIndexed([{ hubIntro: null }, { hubIntro: '' }])).toBe(false)
    expect(subfieldIndexIndexed([{ hubIntro: null }, { hubIntro: 'Intro' }])).toBe(true)
  })
})
