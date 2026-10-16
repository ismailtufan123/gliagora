import { describe, expect, it } from 'vitest'

import { aiDraftSchema, storedDraft } from './draft'

const draft = {
  version: 1,
  by: 'claude-code',
  at: '2026-10-20T08:00:00.000Z',
  from: "the posting's redacted title and text, exported on 2026-10-20",
  inputHash: 'b'.repeat(64),
  summary: 'A two-year postdoc on sleep and memory in zebrafish.',
  positionType: 'postdoc',
  careerStages: ['early-postdoc'],
  subfields: ['integrative-physiology'],
  deadline: { kind: 'rolling', date: null, timeZone: null, from: "the text: 'until filled'" },
  place: null,
}

describe('aiDraftSchema', () => {
  it('takes a complete draft', () => {
    expect(aiDraftSchema.safeParse(draft).success).toBe(true)
    expect(storedDraft(draft)).toMatchObject({ by: 'claude-code' })
  })

  it('refuses a long summary, an unknown time zone, a fixed deadline without a day and extra fields', () => {
    const bad = [
      { ...draft, summary: 'x'.repeat(281) },
      {
        ...draft,
        deadline: { kind: 'fixed', date: '2026-12-01', timeZone: 'Mars/Olympus', from: 'x' },
      },
      { ...draft, deadline: { kind: 'fixed', date: null, timeZone: null, from: 'x' } },
      { ...draft, deadline: { kind: 'rolling', date: '2026-12-01', timeZone: null, from: 'x' } },
      { ...draft, email: 'someone@example.org' },
      { ...draft, inputHash: 'not a hash' },
      { ...draft, place: { city: 'X', country: 'germany', from: 'x' } },
    ]
    for (const value of bad) expect(aiDraftSchema.safeParse(value).success).toBe(false)
    expect(storedDraft(bad[0])).toBeNull()
    expect(storedDraft(null)).toBeNull()
  })
})
