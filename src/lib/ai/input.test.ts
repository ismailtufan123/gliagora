import { describe, expect, it } from 'vitest'

import { draftInput, inputHash } from './input'

// Invented people and addresses only.
const candidate = {
  id: 5,
  kind: 'job',
  status: 'new',
  rawTitle: 'PhD position in the Doe Lab (contact jane.doe@example.org)',
  rawUrl: 'https://www.example.org/jobs/jane-doe-lab-phd',
  snippet: 'Supervised by Prof. Jane Doe. Call +44 20 7946 0000.',
  decisionNote: 'Editor note: ask Jane',
  extracted: {
    version: 1,
    readAt: '2026-10-16T04:40:00.000Z',
    listedOn: { kind: 'page', url: 'https://www.example.org/jobs/' },
    page: 'read',
    deadline: {
      value: { date: '2026-12-01', timeZone: null },
      from: 'the text: "Apply to Dr. Jane Doe by 1 December 2026"',
    },
    location: { value: 'Example City, DE', from: 'the list' },
  },
  tagSuggestions: {
    subfields: [{ slug: 'glia', label: 'Glial biology', words: ['astrocytes'] }],
    methods: [],
    modelSystems: [],
    positionType: { slug: 'phd', label: 'PhD', words: ['PhD position'] },
    careerStages: [],
  },
} as never
const institution = {
  id: 1,
  name: 'Example Institute',
  city: 'Example City',
  country: 'DE',
  timeZone: 'Europe/Berlin',
} as never

describe('draftInput', () => {
  const input = draftInput(candidate, institution)
  const sent = JSON.stringify(input)

  it('holds only redacted text: no name, email, phone, address of the posting or editor note', () => {
    expect(sent).not.toMatch(/jane|doe|@|7946|example\.org\/jobs|Editor note/i)
    expect(input.title).toBe('PhD position in the [name] Lab (contact [email])')
    expect(input.text).toBe('Supervised by Prof. [name]. Call [phone].')
    expect(input.facts.deadline?.from).toBe('the text: "Apply to Dr. [name] by 1 December 2026"')
  })

  it('gives the institution, the facts and the suggested tags', () => {
    expect(input).toMatchObject({
      institution: { name: 'Example Institute', country: 'DE', timeZone: 'Europe/Berlin' },
      facts: { deadline: { date: '2026-12-01' }, location: 'Example City, DE' },
      suggestedTags: { positionType: 'phd', subfields: ['glia'], careerStages: [] },
    })
  })

  it('has a hash that changes only with the input', () => {
    expect(inputHash(draftInput(candidate, institution))).toBe(inputHash(input))
    expect(
      inputHash(
        draftInput({ ...(candidate as object), snippet: 'Other text.' } as never, institution),
      ),
    ).not.toBe(inputHash(input))
  })
})
