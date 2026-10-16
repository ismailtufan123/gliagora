import { describe, expect, it } from 'vitest'

import { compileTerms } from '@/lib/tags/match'
import { termKey } from '@/lib/tags/terms'
import { TAXONOMY_2026_09 } from '@/migrations/data/taxonomy-2026-09'

import {
  DEFAULT_MODEL,
  claudeApiSettings,
  costUsd,
  describeClaudeApi,
  requestDraft,
} from './claude-api'
import { aiDraftSchema } from './draft'

const taxonomy = {
  compiled: compileTerms(TAXONOMY_2026_09),
  byKey: new Map(
    TAXONOMY_2026_09.map((t, i) => [termKey(t.vocabulary, t.slug), { id: i + 1, label: t.label }]),
  ),
}

describe('claudeApiSettings', () => {
  it('is off until both the key and a monthly cap are set', () => {
    expect(claudeApiSettings({})).toBeNull()
    expect(claudeApiSettings({ ANTHROPIC_API_KEY: 'sk-test' })).toBeNull()
    expect(claudeApiSettings({ AI_MONTHLY_CAP_USD: '15' })).toBeNull()
    expect(claudeApiSettings({ ANTHROPIC_API_KEY: 'sk-test', AI_MONTHLY_CAP_USD: '0' })).toBeNull()
    expect(claudeApiSettings({ ANTHROPIC_API_KEY: 'sk-test', AI_MONTHLY_CAP_USD: '15' })).toEqual({
      apiKey: 'sk-test',
      capUsd: 15,
      model: DEFAULT_MODEL,
    })
  })

  it('takes another model only if its price is known, so the cap can hold', () => {
    const base = { ANTHROPIC_API_KEY: 'sk-test', AI_MONTHLY_CAP_USD: '15' }
    expect(claudeApiSettings({ ...base, CLAUDE_MODEL: 'claude-haiku-5-5' })?.model).toBe(
      'claude-haiku-5-5',
    )
    expect(claudeApiSettings({ ...base, CLAUDE_MODEL: 'some-other-model' })).toBeNull()
  })
})

describe('costUsd', () => {
  it("prices the tokens at the model's rates", () => {
    expect(
      costUsd('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 }),
    ).toBeCloseTo(6)
    expect(costUsd('claude-haiku-5-5', { input_tokens: 2_000_000, output_tokens: 0 })).toBeCloseTo(
      0.2,
    )
  })
})

describe('requestDraft', () => {
  const settings = { apiKey: 'sk-test', capUsd: 15, model: DEFAULT_MODEL }
  const input = {
    title: 'PhD position on astrocytes',
    text: 'Fully funded. Apply by 1 December 2026.',
    institution: {
      name: 'Example Institute',
      city: 'Example City',
      country: 'DE',
      timeZone: 'Europe/Berlin',
    },
    facts: {},
    suggestedTags: { positionType: 'phd', subfields: ['glia'], careerStages: [] },
  }
  const fakeClient = (response: object, seen: unknown[] = []) =>
    ({
      beta: {
        messages: {
          parse: async (params: unknown) => {
            seen.push(params)
            return response
          },
        },
      },
    }) as never

  it('sends the input with the rules and the fallback, and maps the answer to a draft', async () => {
    const seen: Array<{
      messages: Array<{ content: string }>
      fallbacks: string
      betas: string[]
    }> = []
    const result = await requestDraft(
      fakeClient(
        {
          model: DEFAULT_MODEL,
          stop_reason: 'end_turn',
          usage: { input_tokens: 2000, output_tokens: 300 },
          parsed_output: {
            summary: 'A funded PhD on how astrocytes shape brain circuits, at Example Institute.',
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
            place: { city: 'Example City', country: 'de', from: 'the employer' },
            note: '',
          },
        },
        seen,
      ),
      settings,
      taxonomy,
      input,
      new Date('2026-10-20T07:30:00Z'),
    )
    expect(JSON.parse(seen[0]!.messages[0]!.content)).toEqual(input)
    expect(seen[0]).toMatchObject({
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    })
    expect(result.usd).toBeCloseTo((2000 * 4 + 300 * 20) / 1e6)
    expect(aiDraftSchema.safeParse(result.draft).success).toBe(true)
    expect(result.draft).toMatchObject({ by: 'claude-api', place: { country: 'DE' } })
  })

  it('reports a refusal and its cost', async () => {
    const result = await requestDraft(
      fakeClient({
        model: DEFAULT_MODEL,
        stop_reason: 'refusal',
        usage: { input_tokens: 100, output_tokens: 0 },
        parsed_output: null,
      }),
      settings,
      taxonomy,
      input,
      new Date(),
    )
    expect(result).toMatchObject({ draft: null, refused: true })
    expect(result.usd).toBeGreaterThan(0)
  })
})

describe('describeClaudeApi', () => {
  it('says whether the Claude API is on, never the key', () => {
    expect(describeClaudeApi({})).toBe('AI drafts by the Claude API: off')
    expect(describeClaudeApi({ ANTHROPIC_API_KEY: 'sk-secret' })).toBe(
      'AI drafts by the Claude API: off (no AI_MONTHLY_CAP_USD)',
    )
    const on = describeClaudeApi({ ANTHROPIC_API_KEY: 'sk-secret', AI_MONTHLY_CAP_USD: '15' })
    expect(on).toBe(
      'AI drafts by the Claude API: on (claude-opus-5-5, at most 15 US dollars a month)',
    )
    expect(on).not.toContain('sk-secret')
  })
})
