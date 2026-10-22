import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { addDays, calendarDay } from '@/lib/jobs/deadline'
import { type Fetcher, FetchProblem } from '@/lib/monitors/http'
import { applyChanges } from '@/lib/routine/change'
import { closeGoneJobs } from '@/lib/routine/close'
import { DECISIONS_FORMAT, applyDecisions } from '@/lib/routine/decide'
import { exportForDecisions } from '@/lib/routine/export'
import { routineReport, searchInstitutions } from '@/lib/routine/report'
import { forgetTaxonomy } from '@/lib/tags/terms'

import { DAY, institution, job, rows, testPayload, unique } from './helpers'

// "Update the jobs" (D59) end to end on fake candidates and a fake web: the export, the decisions
// (publish after the rules and the last look, reject, ask), closing, the operator's corrections and
// the report. Invented titles, texts and addresses only; no request leaves the computer.

let payload: Payload
let berlin: number
let bonn: number
let host: string

beforeAll(async () => {
  payload = await testPayload()
  forgetTaxonomy()
  berlin = Number((await institution(payload, { name: unique('Berlin Brain Institute') })).id)
  bonn = Number(
    (
      await institution(payload, {
        name: unique('Bonn Institute for Neural Behaviour'),
        city: 'Bonn',
        lat: 50.73,
        lng: 7.1,
      })
    ).id,
  )
  host = `${unique('careers')}.example.org`
})

afterAll(async () => {
  await payload?.destroy()
})

const today = () => calendarDay(new Date()) as string
const at = (path: string) => `https://${host}/jobs/${path}`

/**
 * Serves `pages` (address → HTML, a status, or a redirect to another address with its HTML) and an
 * allowing robots.txt for every host.
 */
function fakeWeb(pages: Record<string, string | number | { to: string; html: string }>): Fetcher {
  return {
    get: async (url, options) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/robots.txt') {
        return {
          url,
          status: 200,
          contentType: 'text/plain',
          text: 'User-agent: *\nAllow: /\n',
          tdmReserved: false,
        }
      }
      if (options.allow && !(await options.allow(parsed))) throw new FetchProblem('refused')
      const page = pages[url]
      if (page === undefined) throw new FetchProblem('status', 404)
      if (typeof page === 'number') throw new FetchProblem('status', page)
      return {
        url: typeof page === 'object' ? page.to : url,
        status: 200,
        contentType: 'text/html; charset=utf-8',
        text: typeof page === 'object' ? page.html : page,
        tdmReserved: false,
      }
    },
    slowDown: () => {},
  }
}

const page = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p><p>${'We study astrocytes, synapses and sleep in the mouse brain. '.repeat(5)}</p></main></body></html>`

const draft = (deadline: string | null, overrides: Record<string, unknown> = {}) => ({
  version: 1,
  by: 'claude-code',
  model: 'claude-opus-5-5',
  at: new Date().toISOString(),
  from: 'the redacted title and text',
  inputHash: '0'.repeat(64),
  summary: 'A two-year postdoc on how astrocytes shape sleep, with imaging in mice.',
  positionType: 'postdoc',
  careerStages: ['postdoc'],
  subfields: ['glia'],
  deadline: deadline
    ? { kind: 'fixed', date: deadline, timeZone: null, from: 'the text: "Closing date: …"' }
    : { kind: 'rolling', date: null, timeZone: null, from: 'the text: "rolling basis"' },
  place: { city: 'Berlin', country: 'DE', from: 'the text' },
  ...overrides,
})

async function source(fields: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'sources',
    data: {
      name: unique('Fake board'),
      kind: 'page',
      institution: berlin,
      url: `https://${host}/jobs/`,
      postingPattern: `^https://${host.replace(/\./g, '\\.')}/jobs/[a-z0-9-]+$`,
      termsAutomation: 'not-stated',
      schedule: 'daily',
      ...fields,
    } as never,
    depth: 0,
  })
}

async function candidate(path: string, fields: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'candidates',
    data: {
      kind: 'job',
      status: 'new',
      institution: berlin,
      rawUrl: at(path),
      rawTitle: 'Postdoctoral Researcher in Glial Biology',
      snippet: 'A postdoc on astrocytes and sleep. Closing date in some weeks.',
      aiSuggestion: draft(addDays(today(), 40)),
      useAiDraft: true,
      ...fields,
    } as never,
    depth: 0,
  })
}

const decisions = (...list: Array<Record<string, unknown>>) => ({
  format: DECISIONS_FORMAT,
  decisions: list,
})

describe('exportForDecisions', () => {
  it('gives the drafted waiting candidates with their checks, never a posting address', async () => {
    const drafted = await candidate(unique('export'))
    const undrafted = await candidate(unique('undrafted'), { aiSuggestion: null })
    const exported = await exportForDecisions(payload, new Date())
    const entry = exported.candidates.find((c) => c.id === drafted.id)
    expect(entry).toMatchObject({
      adminPath: `/admin/collections/candidates/${drafted.id}`,
      draft: { summary: expect.any(String) },
      checks: { notResearch: null },
    })
    expect(exported.candidates.find((c) => c.id === undrafted.id)).toBeUndefined()
    expect(exported.waitingForDrafts).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(exported)).not.toContain(host)
    expect(exported.rules.length).toBeGreaterThan(3)
  })
})

describe('applyDecisions', () => {
  it('publishes after the rules and the last look, and marks the job', async () => {
    const path = unique('open')
    const open = await candidate(path)
    const fetcher = fakeWeb({
      [at(path)]: page('Postdoctoral Researcher in Glial Biology', 'Apply now.'),
    })
    const result = await applyDecisions(
      payload,
      decisions({
        id: open.id,
        decision: 'publish',
        why: 'A glia postdoc, open for 40 days.',
        language: 'en',
      }),
      { fetcher },
    )
    expect(result.results[0]).toMatchObject({
      outcome: 'published',
      job: { path: expect.stringMatching(/^\/en\/jobs\//) },
    })
    const accepted = await payload.findByID({ collection: 'candidates', id: open.id, depth: 0 })
    expect(accepted.status).toBe('accepted')
    expect(accepted.decisionNote).toMatch(/Update the jobs \(D59\)/)
    const published = await payload.findByID({
      collection: 'jobs',
      id: Number(accepted.publishedRef),
      depth: 0,
    })
    expect(published).toMatchObject({
      status: 'published',
      publishedByRoutine: true,
      aiAssisted: true,
      summary: 'A two-year postdoc on how astrocytes shape sleep, with imaging in mice.',
      deadlineKind: 'fixed',
      checks: {
        employerOrigin: true,
        positionOpen: true,
        deadlineConfirmed: true,
        ownWords: true,
        noPersonalContacts: true,
      },
    })
    expect(calendarDay(published.verifiedAt)).toBe(today())
    expect(calendarDay(published.deadlineDate)).toBe(addDays(today(), 40))
    expect(published.internalNotes).toMatch(/on the operator's command/)
  })

  it('rejects as closed a page that is gone or says the position is filled, and waits for one that does not answer', async () => {
    const [gone, filled, down] = [unique('gone'), unique('filled'), unique('down')]
    const ids = await Promise.all(
      [gone, filled, down].map(async (path) => (await candidate(path)).id),
    )
    const fetcher = fakeWeb({
      [at(filled)]: page('Postdoc', 'This position has been filled.'),
      [at(down)]: 503,
    })
    const result = await applyDecisions(
      payload,
      decisions(...ids.map((id) => ({ id, decision: 'publish', why: 'Meets the rules.' }))),
      { fetcher },
    )
    expect(result.results.map((r) => r.outcome)).toEqual(['closed', 'closed', 'not-answering'])
    for (const id of ids.slice(0, 2)) {
      const closed = await payload.findByID({ collection: 'candidates', id, depth: 0 })
      expect(closed).toMatchObject({ status: 'rejected', decisionReason: 'closed' })
    }
    expect(
      (await payload.findByID({ collection: 'candidates', id: ids[2]!, depth: 0 })).status,
    ).toBe('new')
    // The answer names no address.
    expect(JSON.stringify(result)).not.toContain(host)
  })

  it('refuses what breaks a rule, and a page whose deadline differs', async () => {
    const named = await candidate(unique('named'), { rawTitle: 'Postdoc in the Exemplar Lab' })
    const soon = await candidate(unique('soon'), { aiSuggestion: draft(addDays(today(), 1)) })
    const otherPath = unique('other-deadline')
    const other = await candidate(otherPath)
    const fetcher = fakeWeb({
      [at(otherPath)]: page('Postdoc', `Closing date: ${addDays(today(), 20)}`),
    })
    const result = await applyDecisions(
      payload,
      decisions(
        { id: named.id, decision: 'publish', why: 'Meets the rules.' },
        { id: soon.id, decision: 'publish', why: 'Meets the rules.' },
        { id: other.id, decision: 'publish', why: 'Meets the rules.' },
      ),
      { fetcher },
    )
    expect(result.results.map((r) => r.outcome)).toEqual(['refused', 'refused', 'refused'])
    expect(result.results[0]!.problems!.join(' ')).toMatch(/title cannot be published/)
    expect(result.results[1]!.problems!.join(' ')).toMatch(/less than 3 days/)
    expect(result.results[2]!.problems!.join(' ')).toMatch(/page's deadline/)
    for (const { id } of [named, soon, other]) {
      expect((await payload.findByID({ collection: 'candidates', id, depth: 0 })).status).toBe(
        'new',
      )
    }
  })

  it("lets the operator's word set a judgement aside, never a name", async () => {
    const path = unique('soon-by-operator')
    const soon = await candidate(path, { aiSuggestion: draft(addDays(today(), 2)) })
    const named = await candidate(unique('named-by-operator'), {
      rawTitle: 'Postdoc, Exemplar Lab',
    })
    const fetcher = fakeWeb({ [at(path)]: page('Postdoc', 'Apply now.') })
    const result = await applyDecisions(
      payload,
      decisions(
        {
          id: soon.id,
          decision: 'publish',
          why: 'The operator wants it.',
          byOperator: true,
          waive: ['deadline-soon'],
        },
        {
          id: named.id,
          decision: 'publish',
          why: 'The operator wants it.',
          byOperator: true,
          waive: ['deadline-soon'],
        },
      ),
      { fetcher },
    )
    expect(result.results.map((r) => r.outcome)).toEqual(['published', 'refused'])
  })

  it('closes a page whose own deadline has passed, whatever the operator waived', async () => {
    const path = unique('page-passed')
    const passed = await candidate(path, {
      aiSuggestion: draft(null),
      extracted: {
        version: 1,
        readAt: new Date().toISOString(),
        listedOn: { kind: 'page', url: `https://${host}/jobs/` },
        page: 'read',
        published: { value: today(), from: 'the list' },
      },
    })
    const fetcher = fakeWeb({
      [at(path)]: page('Postdoc', `Closing date: ${addDays(today(), -10)}`),
    })
    const result = await applyDecisions(
      payload,
      decisions({
        id: passed.id,
        decision: 'publish',
        why: 'The operator wants it.',
        byOperator: true,
        waive: ['page-deadline', 'open-ended-age'],
      }),
      { fetcher },
    )
    expect(result.results[0]!.outcome).toBe('closed')
    expect(
      await payload.findByID({ collection: 'candidates', id: passed.id, depth: 0 }),
    ).toMatchObject({ status: 'rejected', decisionReason: 'closed' })
  })

  it('refuses a title in a caseless script, a city with an address, and a waiver without the operator', async () => {
    const caseless = await candidate(unique('caseless'), { rawTitle: '博士后 课题组' })
    const city = await candidate(unique('city'))
    const result = await applyDecisions(
      payload,
      decisions(
        { id: caseless.id, decision: 'publish', why: 'Meets the rules.' },
        {
          id: city.id,
          decision: 'publish',
          why: 'Meets the rules.',
          place: { city: 'apply at jobs.example.org', country: 'DE' },
        },
      ),
      { fetcher: fakeWeb({}), dryRun: true },
    )
    expect(result.results.map((r) => r.outcome)).toEqual(['refused', 'refused'])
    await expect(
      applyDecisions(
        payload,
        decisions({
          id: city.id,
          decision: 'publish',
          why: 'Meets the rules.',
          waive: ['redirect'],
        }),
        { fetcher: fakeWeb({}), dryRun: true },
      ),
    ).rejects.toThrow()
  })

  it('writes the deadline in the zone the rules checked, and answers a decision made before', async () => {
    const path = unique('zone')
    const day = addDays(today(), 40)
    // Its own title: the same title, place and deadline as another job would be a duplicate.
    const zoned = await candidate(path, {
      rawTitle: 'Research Technician in Glial Imaging',
      aiSuggestion: draft(day, {
        deadline: { kind: 'fixed', date: day, timeZone: 'Pacific/Kiritimati', from: 'the text' },
      }),
    })
    const fetcher = fakeWeb({ [at(path)]: page('Postdoc', 'Apply now.') })
    const decision = decisions({
      id: zoned.id,
      decision: 'publish',
      why: 'Meets the rules.',
      deadline: { kind: 'fixed', date: day, timeZone: null },
    })
    const first = await applyDecisions(payload, decision, { fetcher })
    expect(first.results[0], JSON.stringify(first.results[0])).toMatchObject({
      outcome: 'published',
    })
    const accepted = await payload.findByID({ collection: 'candidates', id: zoned.id, depth: 0 })
    const published = await payload.findByID({
      collection: 'jobs',
      id: Number(accepted.publishedRef),
      depth: 0,
    })
    const place = await payload.findByID({ collection: 'institutions', id: berlin, depth: 0 })
    expect(published.deadlineTz).toBe(place.timeZone ?? null)
    expect(published.deadlineTz).not.toBe('Pacific/Kiritimati')
    const again = await applyDecisions(payload, decision, { fetcher })
    expect(again.results[0]).toMatchObject({ outcome: 'decided', job: first.results[0]!.job })
  })

  it('publishes again what a last look took for filled, two positions of one title, and a redirect to the same posting', async () => {
    const [mistaken, first, second, moved] = [
      unique('until-filled'),
      unique('twin-a'),
      unique('twin-b'),
      unique('moved'),
    ]
    const candidates = await Promise.all([
      candidate(mistaken, { rawTitle: 'Research Technician in Myelin Imaging' }),
      candidate(first, { rawTitle: 'PhD Student in Neurochemistry' }),
      candidate(second, { rawTitle: 'PhD Student in Neurochemistry' }),
      candidate(moved, { rawTitle: 'Postdoc in Cortical Oscillations' }),
    ])
    const ids = candidates.map((c) => c.id)
    // An earlier run's mistake: the page was read as filled and the candidate rejected as closed.
    await payload.update({
      collection: 'candidates',
      id: ids[0]!,
      data: {
        status: 'rejected',
        decisionReason: 'closed',
        decisionNote:
          'Update the jobs (D59), 2026-10-22: the last look before publishing found it closed.',
      },
      depth: 0,
    })
    const fetcher = fakeWeb({
      [at(mistaken)]: page(
        'Research Technician in Myelin Imaging',
        'Open until the position is filled.',
      ),
      [at(first)]: page('PhD Student in Neurochemistry', 'Project one.'),
      [at(second)]: page('PhD Student in Neurochemistry', 'Project two.'),
      [at(moved)]: {
        to: `https://${host}/apply/form?id=1`,
        html: page('Postdoc in Cortical Oscillations', 'Apply now.'),
      },
    })
    const result = await applyDecisions(
      payload,
      decisions(
        { id: ids[0], decision: 'publish', reopen: true, why: 'The page is open until filled.' },
        { id: ids[1], decision: 'publish', why: 'Project one.' },
        {
          id: ids[2],
          decision: 'publish',
          notDuplicate: true,
          why: 'Another project of the same title.',
        },
        { id: ids[3], decision: 'publish', why: 'The address moved within the employer site.' },
      ),
      { fetcher },
    )
    expect(result.results.map((r) => r.outcome)).toEqual([
      'published',
      'published',
      'published',
      'published',
    ])
    // Without reopen, a decided candidate stays decided.
    const again = await applyDecisions(
      payload,
      decisions({ id: ids[0], decision: 'publish', why: 'Again.' }),
      { fetcher },
    )
    expect(again.results[0]!.outcome).toBe('decided')
  })

  it('rejects with a reason and asks with a question', async () => {
    const rejected = await candidate(unique('rejected'))
    const asked = await candidate(unique('asked'))
    await applyDecisions(
      payload,
      decisions(
        {
          id: rejected.id,
          decision: 'reject',
          reason: 'not-research',
          why: 'An administrative post.',
        },
        {
          id: asked.id,
          decision: 'ask',
          question: 'Is this lab in neuroscience?',
          why: 'Its words are borderline.',
        },
      ),
      { fetcher: fakeWeb({}) },
    )
    expect(
      await payload.findByID({ collection: 'candidates', id: rejected.id, depth: 0 }),
    ).toMatchObject({
      status: 'rejected',
      decisionReason: 'not-research',
    })
    const question = await payload.findByID({ collection: 'candidates', id: asked.id, depth: 0 })
    expect(question.status).toBe('triaged')
    expect(question.decisionNote).toMatch(
      /^Question for the operator .*Is this lab in neuroscience\?/,
    )
  })

  it('changes nothing on a dry run, and reads no page', async () => {
    const dry = await candidate(unique('dry'))
    const asked: string[] = []
    const fetcher: Fetcher = {
      get: async (url) => {
        asked.push(url)
        throw new FetchProblem('status', 500)
      },
      slowDown: () => {},
    }
    const result = await applyDecisions(
      payload,
      decisions({ id: dry.id, decision: 'publish', why: 'Meets the rules.' }),
      { fetcher, dryRun: true },
    )
    expect(result.results[0]!.outcome).toBe('would-publish')
    expect(asked).toEqual([])
    expect(
      (await payload.findByID({ collection: 'candidates', id: dry.id, depth: 0 })).status,
    ).toBe('new')
  })

  it('takes the institution where the work happens on a shared board', async () => {
    const board = await source({ severalSites: true })
    const path = unique('bonn')
    const shared = await candidate(path, { source: board.id })
    const fetcher = fakeWeb({ [at(path)]: page('Postdoc', 'Apply now.') })
    const without = await applyDecisions(
      payload,
      decisions({ id: shared.id, decision: 'publish', why: 'Meets the rules.' }),
      { fetcher },
    )
    expect(without.results[0]!.outcome).toBe('refused')
    const withSite = await applyDecisions(
      payload,
      decisions({
        id: shared.id,
        decision: 'publish',
        why: 'At the Bonn institute.',
        institution: bonn,
        place: { city: 'Bonn', country: 'DE' },
      }),
      { fetcher },
    )
    expect(withSite.results[0]!.outcome).toBe('published')
    const accepted = await payload.findByID({ collection: 'candidates', id: shared.id, depth: 0 })
    const published = await payload.findByID({
      collection: 'jobs',
      id: Number(accepted.publishedRef),
      depth: 0,
    })
    expect(Number(published.institution)).toBe(bonn)
    expect(published.city).toBe('Bonn')
  })

  it("rejects every waiting candidate of a source on the operator's decision", async () => {
    const board = await source()
    const ids = await Promise.all(
      [1, 2].map(
        async (n) =>
          (await candidate(unique(`board-${n}`), { source: board.id, aiSuggestion: null })).id,
      ),
    )
    const result = await applyDecisions(
      payload,
      {
        format: DECISIONS_FORMAT,
        decisions: [],
        bySource: [
          {
            source: board.id,
            decision: 'reject',
            reason: 'not-employer-page',
            why: 'Its terms.',
            byOperator: true,
          },
        ],
      },
      { fetcher: fakeWeb({}) },
    )
    expect(result.bySource).toEqual([{ source: board.id, rejected: 2, failed: 0 }])
    for (const id of ids) {
      expect((await payload.findByID({ collection: 'candidates', id, depth: 0 })).status).toBe(
        'rejected',
      )
    }
  })
})

describe('closeGoneJobs and applyChanges', () => {
  it('withdraws jobs whose page is gone or filled, unless the warning was set aside', async () => {
    const [gone, filled, dismissed, stale] = await Promise.all(
      [1, 2, 3, 4].map(() => job(payload, berlin)),
    )
    const now = new Date()
    const recent = new Date(now.getTime() - DAY).toISOString()
    const old = new Date(now.getTime() - 20 * DAY).toISOString()
    await rows(
      payload,
      sql`UPDATE jobs SET link_status = 'gone', last_checked_at = ${recent} WHERE id = ${gone!.id}`,
    )
    await rows(
      payload,
      sql`UPDATE jobs SET link_says_closed = true, last_checked_at = ${recent} WHERE id = ${filled!.id}`,
    )
    await rows(
      payload,
      sql`UPDATE jobs SET link_status = 'gone', link_warning_dismissed = true, last_checked_at = ${recent} WHERE id = ${dismissed!.id}`,
    )
    await rows(
      payload,
      sql`UPDATE jobs SET link_status = 'gone', last_checked_at = ${old} WHERE id = ${stale!.id}`,
    )
    const dry = await closeGoneJobs(payload, now, { dryRun: true })
    expect(dry.closed.map((c) => c.shortId)).toEqual(
      expect.arrayContaining([gone!.shortId, filled!.shortId]),
    )
    const result = await closeGoneJobs(payload, now)
    const closed = result.closed.map((c) => c.shortId)
    expect(closed).toEqual(expect.arrayContaining([gone!.shortId, filled!.shortId]))
    expect(closed).not.toContain(dismissed!.shortId)
    expect(closed).not.toContain(stale!.shortId)
    expect((await payload.findByID({ collection: 'jobs', id: gone!.id, depth: 0 })).status).toBe(
      'withdrawn',
    )
    expect(
      (await payload.findByID({ collection: 'jobs', id: dismissed!.id, depth: 0 })).status,
    ).toBe('published')
  })

  it("applies the operator's corrections by short ID or address, through the rules", async () => {
    const [moved, removed, named] = await Promise.all([1, 2, 3].map(() => job(payload, berlin)))
    const newDay = addDays(today(), 50)
    const result = await applyChanges(payload, {
      format: 'gliagora-job-changes/1',
      changes: [
        {
          job: moved!.shortId,
          action: 'set',
          why: 'The employer extended the deadline.',
          set: { deadline: { kind: 'fixed', date: newDay, timeZone: null } },
        },
        {
          job: `https://gliagora.com/en/jobs/${removed!.slug}-${removed!.shortId}/`,
          action: 'withdraw',
          why: 'The operator removed it.',
        },
        {
          job: String(named!.id),
          action: 'set',
          why: 'A new summary.',
          set: { summary: 'Write to Prof. Jane Exemplar.' },
        },
        { job: 'https://jobs.example.org/no-such-posting', action: 'withdraw', why: 'Unknown.' },
      ],
    })
    expect(result.results.map((r) => r.outcome)).toEqual([
      'changed',
      'withdrawn',
      'refused',
      'not-found',
    ])
    // A job not found is named by its place in the file, never by what was sent.
    expect(result.results[3]!.job).toBe('#4')
    const changed = await payload.findByID({ collection: 'jobs', id: moved!.id, depth: 0 })
    expect(calendarDay(changed.deadlineDate)).toBe(newDay)
    expect(calendarDay(changed.verifiedAt)).toBe(today())
    expect((await payload.findByID({ collection: 'jobs', id: removed!.id, depth: 0 })).status).toBe(
      'withdrawn',
    )
  })
})

describe('routineReport and searchInstitutions', () => {
  it('counts the open jobs against the launch gate, and lists the questions', async () => {
    const report = await routineReport(payload, new Date())
    expect(report.gate).toEqual({ positions: 150, countries: 25, subfields: 12, institutions: 50 })
    expect(report.open.positions).toBeGreaterThanOrEqual(1)
    expect(report.open.publishedByRoutine).toBeGreaterThanOrEqual(1)
    expect(report.questions.some((q) => q.question.includes('Is this lab in neuroscience?'))).toBe(
      true,
    )
  })

  it('finds our institutions by name', async () => {
    const [found] = await searchInstitutions(payload, { names: ['Bonn Institute for Neural'] })
    expect(found!.matches.map((m) => m.id)).toContain(bonn)
  })
})
