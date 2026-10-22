import { describe, expect, it } from 'vitest'

import { type PublishFacts, blocking, personalDetails, publishProblems } from './rules'

// The written rules of "Update the jobs" (D59) on invented candidates.

const now = new Date('2026-10-22T10:00:00Z')

const facts = (overrides: Partial<PublishFacts> = {}): PublishFacts => ({
  title: 'Postdoctoral Researcher in Glial Biology',
  summary: 'A two-year postdoc on how astrocytes shape sleep, using imaging in mice.',
  startText: null,
  deadline: { kind: 'fixed', date: '2026-11-30', timeZone: null },
  institutionTimeZone: 'Europe/Berlin',
  published: '2026-10-10',
  hasInstitution: true,
  severalSites: false,
  institutionChosen: false,
  notResearch: null,
  ...overrides,
})

const rules = (overrides: Partial<PublishFacts> = {}) =>
  publishProblems(facts(overrides), now).map((problem) => problem.rule)

describe('publishProblems', () => {
  it('passes a post that meets every rule', () => {
    expect(publishProblems(facts(), now)).toEqual([])
    expect(
      rules({ deadline: { kind: 'rolling', date: null, timeZone: null }, published: '2026-09-01' }),
    ).toEqual([])
  })

  it('refuses a name, an email address, a phone number or a placeholder in what is published', () => {
    for (const title of [
      'PhD position in the [name] Lab',
      'Postdoc with Prof. Jane Exemplar',
      'Technician (contact: jane@example.org)',
    ]) {
      const problems = publishProblems(facts({ title }), now)
      expect(
        problems.map((p) => [p.rule, p.hard]),
        title,
      ).toContainEqual(['no-personal-details', true])
    }
    expect(rules({ summary: 'Call +44 20 7946 0000 to apply.' })).toContain('no-personal-details')
    expect(rules({ startText: 'see doelab.example.org' })).toContain('no-personal-details')
  })

  it('needs a deadline at least three days ahead, never a passed one', () => {
    const late = publishProblems(
      facts({ deadline: { kind: 'fixed', date: '2026-10-23', timeZone: null } }),
      now,
    )
    expect(late).toEqual([expect.objectContaining({ rule: 'deadline-soon', hard: false })])
    const passed = publishProblems(
      facts({ deadline: { kind: 'fixed', date: '2026-10-20', timeZone: null } }),
      now,
    )
    expect(passed).toEqual([expect.objectContaining({ rule: 'deadline-passed', hard: true })])
    expect(rules({ deadline: { kind: 'fixed', date: '2035-12-31', timeZone: null } })).toContain(
      'deadline-placeholder',
    )
    expect(rules({ deadline: null })).toContain('deadline-missing')
  })

  it('needs an open-ended post published in the last 60 days', () => {
    const open = { kind: 'until-filled' as const, date: null, timeZone: null }
    expect(rules({ deadline: open, published: '2026-08-01' })).toEqual(['open-ended-age'])
    expect(rules({ deadline: open, published: null })).toEqual(['open-ended-age'])
    expect(rules({ deadline: open, published: '2026-09-15' })).toEqual([])
  })

  it('asks for the institution of a shared board, and for one at all', () => {
    expect(rules({ severalSites: true })).toEqual(['institution'])
    expect(rules({ severalSites: true, institutionChosen: true })).toEqual([])
    expect(rules({ hasInstitution: false })).toEqual(['institution'])
  })

  it('names a post the title reads as not research', () => {
    expect(rules({ notResearch: { kind: 'nursing', words: 'Nurse' } })).toEqual(['not-research'])
  })

  it('refuses names in scripts without capitals, and a city that gives an address', () => {
    expect(rules({ title: '博士后 张伟 课题组' })).toContain('no-personal-details')
    expect(rules({ city: 'apply at jobs.example.org' })).toContain('no-personal-details')
    expect(rules({ city: 'Bonn' })).toEqual([])
  })

  it("lets the operator's word set aside the judgements it names, never the hard rules", () => {
    const problems = publishProblems(
      facts({
        notResearch: { kind: 'clinical', words: 'Neurologist' },
        deadline: { kind: 'fixed', date: '2026-10-23', timeZone: null },
        title: 'Neurologist, [name] Lab',
      }),
      now,
    )
    expect(blocking(problems, ['not-research', 'deadline-soon']).map((p) => p.rule)).toEqual([
      'no-personal-details',
    ])
    expect(blocking(problems, ['deadline-soon']).map((p) => p.rule)).toEqual([
      'no-personal-details',
      'not-research',
    ])
    expect(blocking(problems)).toHaveLength(3)
  })
})

describe('personalDetails', () => {
  it('keeps institutions, places and topics', () => {
    for (const text of [
      'Cold Spring Harbor Laboratory',
      'A PhD at the Max Planck Institute for Biological Intelligence in Martinsried.',
      'Research Technician, Neural Circuits Group',
      'January 2027',
    ]) {
      expect(personalDetails(text), text).toBeNull()
    }
  })
})
