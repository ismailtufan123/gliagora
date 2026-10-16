import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { Payload } from 'payload'
import { z } from 'zod'

import { DEADLINE_KINDS } from '@/lib/jobs/deadline'
import type { Taxonomy } from '@/lib/tags/terms'

import type { AiDraft } from './draft'
import { type DraftInput, inputHash } from './input'
import { DRAFT_RULES } from './weekly'

// The second way in for AI drafts (PLAN §6.6, D52): the Claude API, by Anthropic, called by the
// scheduled task `draftWithClaude`. Built, but off until the operator sets both ANTHROPIC_API_KEY
// and AI_MONTHLY_CAP_USD (a monthly spend limit in US dollars; set one in the Claude Console too).
// It sends the same redacted input as the weekly run (src/lib/ai/input.ts) and nothing else: no
// address, no notes, nothing about members. The answer is checked like an imported draft and kept
// in the candidate's `aiSuggestion`; nothing reaches the public site without an editor.

/** The model, unless CLAUDE_MODEL names another (a cheaper one is the operator's choice). */
export const DEFAULT_MODEL = 'claude-opus-5-5'

/** US dollars per million tokens (input, output): Anthropic's prices of 2026-10-06. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

/** The price assumed for a model not in the list (a fallback model): the highest above. */
const UNKNOWN_PRICE = { input: 5, output: 25 }

/** The most tokens one answer may take. */
export const MAX_OUTPUT_TOKENS = 4000

export type ClaudeApiSettings = { apiKey: string; capUsd: number; model: string }

/** The settings, or null while the Claude API is off (no key, or no monthly cap). */
export function claudeApiSettings(
  env: Record<string, string | undefined> = process.env,
): ClaudeApiSettings | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  const capUsd = Number(env.AI_MONTHLY_CAP_USD)
  if (!apiKey || !Number.isFinite(capUsd) || capUsd <= 0) return null
  const model = env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL
  if (!PRICES[model]) return null
  return { apiKey, capUsd, model }
}

/** The app's start line about the Claude API (never the key). */
export function describeClaudeApi(env: Record<string, string | undefined> = process.env): string {
  const settings = claudeApiSettings(env)
  if (settings) {
    return `AI drafts by the Claude API: on (${settings.model}, at most ${settings.capUsd} US dollars a month)`
  }
  const model = env.CLAUDE_MODEL?.trim()
  if (env.ANTHROPIC_API_KEY?.trim() && model && !PRICES[model]) {
    return 'AI drafts by the Claude API: off (CLAUDE_MODEL names a model whose price is not known)'
  }
  if (env.ANTHROPIC_API_KEY?.trim())
    return 'AI drafts by the Claude API: off (no AI_MONTHLY_CAP_USD)'
  return 'AI drafts by the Claude API: off'
}

/** What `usage` cost, in US dollars, at `model`'s price. */
export function costUsd(
  model: string,
  usage: {
    input_tokens?: number | null
    output_tokens?: number | null
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  },
): number {
  const price = PRICES[model] ?? UNKNOWN_PRICE
  const input =
    (usage.input_tokens ?? 0) +
    1.25 * (usage.cache_creation_input_tokens ?? 0) +
    0.1 * (usage.cache_read_input_tokens ?? 0)
  return (input * price.input + (usage.output_tokens ?? 0) * price.output) / 1_000_000
}

/** A cautious estimate of one request's cost before it is sent: about 3 characters a token. */
export function estimateUsd(model: string, input: DraftInput): number {
  const price = PRICES[model] ?? UNKNOWN_PRICE
  const tokens = Math.ceil((JSON.stringify(input).length + 3000) / 3)
  return (tokens * price.input + MAX_OUTPUT_TOKENS * price.output) / 1_000_000
}

const SPEND_KEY = (now: Date) => `ai-spend:${now.toISOString().slice(0, 7)}`

/** What the Claude API cost this calendar month (UTC), as recorded after each request. */
export async function monthSpend(payload: Payload, now: Date): Promise<number> {
  const value = await payload.kv.get<{ usd: number }>(SPEND_KEY(now))
  return typeof value?.usd === 'number' ? value.usd : 0
}

export async function recordSpend(payload: Payload, now: Date, usd: number): Promise<void> {
  await payload.kv.set(SPEND_KEY(now), { usd: (await monthSpend(payload, now)) + usd })
}

/** The answer the model gives, constrained to the taxonomy's terms. */
export function answerSchema(taxonomy: Taxonomy) {
  const slugs = (vocabulary: string) => {
    const list = [...taxonomy.byKey.keys()]
      .filter((key) => key.startsWith(`${vocabulary}/`))
      .map((key) => key.slice(vocabulary.length + 1))
    return z.enum(list.length > 0 ? (list as [string, ...string[]]) : ['none'])
  }
  return z.object({
    summary: z.string(),
    from: z.string(),
    positionType: slugs('position-type').nullable(),
    subfields: z.array(slugs('subfield')),
    careerStages: z.array(slugs('career-stage')),
    deadline: z
      .object({
        kind: z.enum(DEADLINE_KINDS.map(({ value }) => value) as [string, ...string[]]),
        date: z.string().nullable(),
        timeZone: z.string().nullable(),
        from: z.string(),
      })
      .nullable(),
    place: z
      .object({ city: z.string().nullable(), country: z.string().nullable(), from: z.string() })
      .nullable(),
    note: z.string(),
  })
}

export const SYSTEM_PROMPT = [
  'You help the editor of Gliagora, a neuroscience job listings site, by drafting one listing at a time from a posting.',
  'The posting arrives as JSON: its title and text (names, email addresses and phone numbers already replaced with [name], [email] and [phone]), the facts a program read from it, the suggested tags and the employer.',
  'An editor checks every fact on the original posting and rewrites what needs it before anything is published, so be accurate and say when something is unclear.',
  'Rules:',
  ...DRAFT_RULES.map((rule) => `- ${rule}`),
].join('\n')

/** The client: one per run (the SDK retries 429 and 5xx twice). Tests pass their own. */
export type DraftClient = Pick<Anthropic, 'beta'>

export function newClient(settings: ClaudeApiSettings): DraftClient {
  return new Anthropic({ apiKey: settings.apiKey, maxRetries: 2, timeout: 120_000 })
}

export type ApiDraft = { draft: AiDraft | null; usd: number; refused: boolean }

/** Asks the Claude API for the draft of one input. */
export async function requestDraft(
  client: DraftClient,
  settings: ClaudeApiSettings,
  taxonomy: Taxonomy,
  input: DraftInput,
  now: Date,
): Promise<ApiDraft> {
  const response = await client.beta.messages.parse({
    model: settings.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    // A request a safety classifier declines is run again on Anthropic's recommended model for it.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: betaZodOutputFormat(answerSchema(taxonomy)) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  })
  // Priced at the dearer of the model asked for and the one that answered (a fallback).
  const usd = Math.max(
    costUsd(settings.model, response.usage),
    costUsd(response.model, response.usage),
  )
  if (response.stop_reason === 'refusal') return { draft: null, usd, refused: true }
  const answer = response.parsed_output
  if (!answer) return { draft: null, usd, refused: false }
  const draft: AiDraft = {
    version: 1,
    by: 'claude-api',
    model: response.model,
    at: now.toISOString(),
    from: answer.from.slice(0, 300) || "the posting's redacted title and text",
    inputHash: inputHash(input),
    summary: answer.summary.trim(),
    positionType: answer.positionType,
    careerStages: answer.careerStages.slice(0, 4),
    subfields: answer.subfields.slice(0, 4),
    deadline: answer.deadline
      ? {
          kind: answer.deadline.kind,
          date: answer.deadline.date,
          timeZone: answer.deadline.timeZone,
          from: answer.deadline.from.slice(0, 300) || 'the text',
        }
      : null,
    place: answer.place
      ? {
          city: answer.place.city,
          country: answer.place.country?.toUpperCase() ?? null,
          from: answer.place.from.slice(0, 300) || 'the text',
        }
      : null,
    ...(answer.note.trim() ? { note: answer.note.trim().slice(0, 500) } : {}),
  }
  return { draft, usd, refused: false }
}
