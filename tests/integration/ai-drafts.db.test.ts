import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { draftWithClaude } from '@/jobs/maintenance/draftWithClaude'
import { monthSpend } from '@/lib/ai/claude-api'
import { IMPORT_FORMAT, exportForDrafts, importDrafts, waitingForDrafts } from '@/lib/ai/weekly'
import { forgetTaxonomy } from '@/lib/tags/terms'

import { institution, testPayload, unique } from './helpers'

// The AI drafts (M7, D52) on fake candidates (invented people and addresses): the weekly export
// holds nothing but redacted text, a draft goes back in only if it was written from the current
// input, and the Claude API way keeps to its monthly cap. No request leaves the computer.

let payload: Payload
let institutionId: number

beforeAll(async () => {
  payload = await testPayload()
  forgetTaxonomy()
  institutionId = Number(
    (await institution(payload, { name: unique('Example Brain Institute') })).id,
  )
})

afterAll(async () => {
  await payload?.destroy()
})

async function candidate(fields: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'candidates',
    data: {
      kind: 'job',
      status: 'new',
      institution: institutionId,
      rawUrl: `https://www.example.org/jobs/${unique('doe-lab')}`,
      rawTitle: 'PhD position in the Doe Lab: astrocytes and sleep',
      snippet:
        'Supervised by Prof. Jane Doe (jane.doe@example.org, +44 20 7946 0000). Apply by 1 December 2026.',
      decisionNote: 'Editor note about Jane Doe',
      ...fields,
    } as never,
    depth: 0,
  })
}

const draftFor = (
  exported: { id: number; inputHash: string },
  overrides: Record<string, unknown> = {},
) => ({
  id: exported.id,
  draft: {
    version: 1,
    by: 'claude-code',
    at: '2026-10-20T08:00:00.000Z',
    from: "the posting's redacted title and text, exported on 2026-10-20",
    inputHash: exported.inputHash,
    summary: 'A funded PhD on how astrocytes take part in sleep, at a brain research institute.',
    positionType: 'phd',
    careerStages: ['phd-candidate'],
    subfields: ['glia', 'integrative-physiology'],
    deadline: {
      kind: 'fixed',
      date: '2026-12-01',
      timeZone: null,
      from: 'Apply by 1 December 2026',
    },
    place: null,
    ...overrides,
  },
})

describe('the weekly drafts', () => {
  it('exports only redacted text, then imports the drafts written from it', async () => {
    const one = await candidate()
    const two = await candidate()
    const exported = await exportForDrafts(payload, new Date('2026-10-20T07:00:00Z'))
    const mine = exported.candidates.filter((c) => [one.id, two.id].includes(c.id))
    expect(mine).toHaveLength(2)
    const sent = JSON.stringify(exported)
    expect(sent).not.toMatch(/jane|doe\b|@example|7946|www\.example\.org\/jobs|Editor note/i)
    expect(mine[0]?.input.title).toBe('PhD position in the [name] Lab: astrocytes and sleep')
    expect(exported.vocabularies.subfields).toContainEqual({ slug: 'glia', label: 'Glial biology' })

    const body = { format: IMPORT_FORMAT, drafts: mine.map((c) => draftFor(c)) }
    const dry = await importDrafts(payload, body, { dryRun: true })
    expect(dry.counts.applied).toBe(2)
    expect(
      (await payload.findByID({ collection: 'candidates', id: one.id, depth: 0 })).aiSuggestion,
    ).toBeFalsy()

    const done = await importDrafts(payload, body)
    expect(done.counts.applied).toBe(2)
    const stored = await payload.findByID({ collection: 'candidates', id: one.id, depth: 0 })
    expect(stored.aiSuggestion).toMatchObject({ by: 'claude-code', positionType: 'phd' })
    expect(stored.useAiDraft).toBe(true)

    // Once drafted, a candidate leaves the export and takes no second draft.
    const again = await exportForDrafts(payload, new Date())
    expect(again.candidates.map((c) => c.id)).not.toContain(one.id)
    expect((await importDrafts(payload, body)).counts['has-draft']).toBe(2)
  })

  it('refuses a draft written from other text, one with unknown terms, one for a decided candidate and one not by Claude Code', async () => {
    const changed = await candidate()
    const unknown = await candidate()
    const decided = await candidate()
    const exported = (await exportForDrafts(payload, new Date())).candidates
    const of = (id: number) => exported.find((c) => c.id === id)!
    await payload.update({
      collection: 'candidates',
      id: changed.id,
      data: { snippet: 'New text of the posting.' },
      depth: 0,
    })
    await payload.update({
      collection: 'candidates',
      id: decided.id,
      data: { status: 'triaged' },
      depth: 0,
    })
    await payload.update({
      collection: 'candidates',
      id: decided.id,
      data: { status: 'rejected', decisionReason: 'not-neuroscience' },
      depth: 0,
    })
    const result = await importDrafts(payload, {
      format: IMPORT_FORMAT,
      drafts: [
        draftFor(of(changed.id)),
        draftFor(of(unknown.id), { subfields: ['no-such-subfield'] }),
        draftFor(of(decided.id)),
        {
          ...draftFor(of(unknown.id)),
          id: unknown.id,
          draft: { ...draftFor(of(unknown.id)).draft, by: 'someone' },
        },
      ],
    })
    expect(result.results.map((r) => [r.id, r.outcome])).toEqual([
      [changed.id, 'text-changed'],
      [unknown.id, 'invalid'],
      [decided.id, 'decided'],
    ])
    expect(JSON.stringify(result)).not.toMatch(/astrocytes|Doe/)
  })
})

describe('text in a script redaction cannot read', () => {
  it('is left out of the weekly export and out of the Claude API, and never holds up the others', async () => {
    // Only this test's candidates wait: the others are decided first.
    await payload.update({
      collection: 'candidates',
      where: { status: { in: ['new', 'triaged'] } },
      data: { status: 'rejected', decisionReason: 'spam' },
      depth: 0,
    })
    const chinese = await candidate({
      rawTitle: '神经环路研究组招聘博士后',
      snippet: '联系人：张老师。申请截止：2026年12月1日。',
    })
    const hebrew = await candidate({
      rawTitle: 'Postdoc in neuroscience',
      snippet: 'לפרטים: ד״ר ישראלי. Apply by 1 December 2026.',
    })
    const korean = await candidate({ snippet: '문의: 김 박사. Apply by 1 December 2026.' })
    const english = await candidate()

    const found = await waitingForDrafts(payload, 1)
    expect(found.waiting.map((w) => w.candidate.id)).toEqual([english.id])
    expect(found.leftForEditors).toBe(3)

    const exported = await exportForDrafts(payload, new Date('2026-10-20T07:00:00Z'))
    const ids = exported.candidates.map((c) => c.id)
    expect(ids).toEqual([english.id])
    expect(exported.leftForEditors).toBe(3)
    expect(JSON.stringify(exported)).not.toMatch(/张|神经|ישראלי|김/)

    const asked: string[] = []
    const counts = await draftWithClaude(payload, new Date('2026-12-03T07:30:00Z'), {
      env: { ANTHROPIC_API_KEY: 'sk-test-not-a-key', AI_MONTHLY_CAP_USD: '5' },
      client: {
        beta: {
          messages: {
            parse: async (params: { messages: Array<{ content: string }> }) => {
              asked.push(params.messages[0]!.content)
              throw new Error('not needed here')
            },
          },
        },
      } as never,
    })
    expect(counts.notRedactable).toBe(3)
    expect(asked).toHaveLength(1)
    for (const content of asked) expect(content).not.toMatch(/张|神经|ישראלי|김/)
    for (const id of [chinese.id, hebrew.id, korean.id]) {
      const stored = await payload.findByID({ collection: 'candidates', id, depth: 0 })
      expect(stored.aiSuggestion).toBeFalsy()
    }
  })
})

describe('draftWithClaude', () => {
  const env = {
    ANTHROPIC_API_KEY: 'sk-test-not-a-key',
    AI_MONTHLY_CAP_USD: '0.1',
    CLAUDE_MODEL: 'claude-opus-5-5',
  }
  const client = (asked: string[]) =>
    ({
      beta: {
        messages: {
          parse: async (params: { messages: Array<{ content: string }> }) => {
            asked.push(params.messages[0]!.content)
            return {
              model: 'claude-opus-5-5',
              stop_reason: 'end_turn',
              usage: { input_tokens: 1000, output_tokens: 200 },
              parsed_output: {
                summary: 'A funded PhD on astrocytes and sleep at a brain research institute.',
                from: "the posting's redacted title and text",
                positionType: 'phd',
                subfields: ['glia'],
                careerStages: ['phd-candidate'],
                deadline: {
                  kind: 'fixed',
                  date: '2026-12-01',
                  timeZone: null,
                  from: 'Apply by 1 December 2026',
                },
                place: null,
                note: '',
              },
            }
          },
        },
      },
    }) as never

  it('does nothing while it is off', async () => {
    expect(await draftWithClaude(payload, new Date(), { env: {} })).toMatchObject({
      drafted: 0,
      failed: 0,
    })
  })

  it("drafts waiting candidates with redacted text only, until the month's cap", async () => {
    await candidate()
    await candidate()
    const now = new Date('2026-11-03T07:30:00Z')
    const asked: string[] = []
    const counts = await draftWithClaude(payload, now, { env, client: client(asked) })
    expect(counts.drafted).toBe(2)
    expect(counts.capReached).toBe(1)
    for (const content of asked) expect(content).not.toMatch(/jane|doe\b|@example|7946/i)
    expect(await monthSpend(payload, now)).toBeLessThanOrEqual(0.1)
    expect(await monthSpend(payload, now)).toBeGreaterThan(0)
  })
})
