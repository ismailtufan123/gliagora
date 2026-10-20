import { describe, expect, it } from 'vitest'

import { aiDraft, day, monitorFacts, suggestedTags, termKeys } from './candidate-summary'

const LABELS: Record<string, string> = {
  'subfield:glia': 'Glial biology',
  'method:electrophysiology': 'Electrophysiology',
  'model-system:zebrafish': 'Zebrafish',
  'position-type:research-staff': 'Research staff',
  'career-stage:research-staff': 'Research staff',
}
const labels = (vocabulary: string, slug: string) => LABELS[`${vocabulary}:${slug}`] ?? slug
const values = (group: { rows: { label: string; value: string; from?: string }[] } | null) =>
  Object.fromEntries(group?.rows.map((row) => [row.label, row.value]) ?? [])

describe('a candidate in plain words', () => {
  it('writes days as the admin reads them', () => {
    expect(day('2026-11-30')).toBe('30 Nov 2026')
    expect(day('not a day')).toBe('not a day')
  })

  it("says what a monitor found, each fact with what it came from, and nothing for an editor's candidate", () => {
    const facts = monitorFacts({
      version: 1,
      readAt: '2026-10-18T04:41:00.000Z',
      listedOn: { kind: 'sitemap', url: 'https://careers.example.org/sitemap.xml' },
      page: 'read',
      deadline: {
        value: { date: '2026-11-30', timeZone: 'Europe/Berlin' },
        from: "the posting's JSON-LD validThrough",
      },
      location: { value: 'Berlin, Germany', from: "the posting's JSON-LD" },
      published: { value: '2026-10-01', from: 'the list' },
    })
    expect(values(facts)).toEqual({
      'Listed on': 'Sitemap of posting pages (XML), careers.example.org',
      "The posting's page": 'read',
      Deadline: '30 Nov 2026, Europe/Berlin',
      Place: 'Berlin, Germany',
      Published: '1 Oct 2026',
      Read: '18 Oct 2026, 04:41 UTC',
    })
    expect(facts?.rows.find((row) => row.label === 'Deadline')?.from).toBe(
      "the posting's JSON-LD validThrough",
    )
    expect(monitorFacts(null)).toBeNull()
    expect(monitorFacts({ note: 'something else' })).toBeNull()
  })

  it('names an open-ended posting, a deadline without a time zone and a posting possibly filled', () => {
    expect(
      values(
        monitorFacts({
          version: 1,
          readAt: '2026-10-18T04:41:00.000Z',
          page: 'robots',
          openEnded: { value: 'until-filled', from: 'the text' },
          possiblyFilled: { value: { published: '2026-07-01', days: 109 }, from: 'the list' },
        }),
      ),
    ).toMatchObject({
      "The posting's page": 'not read: robots.txt does not allow it',
      'No fixed deadline': 'Open until filled',
      'Possibly filled':
        'No fixed deadline, and published 1 Jul 2026, 109 days ago: check first that it is still open.',
    })
    expect(
      values(
        monitorFacts({
          version: 1,
          readAt: '2026-10-18T04:41:00.000Z',
          deadline: { value: { date: '2026-11-30', timeZone: null }, from: 'the text' },
        }),
      ).Deadline,
    ).toBe('30 Nov 2026, no time zone named (it ends Anywhere on Earth)')
  })

  it('lists the suggested tags by their labels, with the words they came from', () => {
    const tags = suggestedTags(
      {
        subfields: [],
        methods: [{ slug: 'electrophysiology', words: ['patch clamp'], score: 3 }],
        modelSystems: [{ slug: 'zebrafish', words: ['zebrafish'], score: 3 }],
        positionType: { slug: 'research-staff', words: ['Research assistant'], score: 3 },
        careerStages: [{ slug: 'research-staff', words: ['Research assistant'], score: 3 }],
      },
      labels,
    )
    expect(values(tags)).toEqual({
      Subfields: 'none found',
      Methods: 'Electrophysiology (“patch clamp”)',
      'Model systems': 'Zebrafish (“zebrafish”)',
      'Position type': 'Research staff (“Research assistant”)',
      'Career stages': 'Research staff (“Research assistant”)',
    })
    expect(suggestedTags(null, labels)).toBeNull()
  })

  it('shows the AI draft with its labels, the country by name, and what each fact came from', () => {
    const draft = aiDraft(
      {
        version: 1,
        by: 'claude-code',
        at: '2026-10-19T10:00:00.000Z',
        from: 'the redacted title and text exported on 19 Oct 2026',
        inputHash: 'a'.repeat(64),
        summary: 'A research assistant post in a zebrafish behaviour group.',
        positionType: 'research-staff',
        careerStages: ['research-staff'],
        subfields: ['glia', 'unknown-slug'],
        deadline: { kind: 'fixed', date: '2026-11-30', timeZone: null, from: 'the text' },
        place: { city: 'Lisbon', country: 'PT', from: 'the institution' },
        note: 'Two deadlines are named; the later is for late applications.',
      },
      labels,
    )
    expect(values(draft)).toEqual({
      Written: 'by Claude Code on 19 Oct 2026, 10:00 UTC',
      Summary: 'A research assistant post in a zebrafish behaviour group.',
      'Position type': 'Research staff',
      Deadline: '30 Nov 2026, no time zone named (it ends Anywhere on Earth)',
      Place: 'Lisbon, Portugal',
      Subfields: 'Glial biology; unknown-slug',
      'Career stages': 'Research staff',
      'Note for the editor': 'Two deadlines are named; the later is for late applications.',
    })
    expect(draft?.rows.find((row) => row.label === 'Place')?.from).toBe('the institution')
    expect(aiDraft(undefined, labels)).toBeNull()
  })

  it('asks once for the labels of every term it names', () => {
    expect(
      termKeys(
        {
          subfields: [{ slug: 'glia' }],
          methods: [],
          modelSystems: [{ slug: 'zebrafish' }],
          positionType: { slug: 'research-staff' },
          careerStages: [],
        },
        {
          version: 1,
          positionType: 'research-staff',
          subfields: ['glia'],
          careerStages: ['student'],
        },
      ).sort(),
    ).toEqual([
      'career-stage:student',
      'model-system:zebrafish',
      'position-type:research-staff',
      'subfield:glia',
    ])
  })
})
