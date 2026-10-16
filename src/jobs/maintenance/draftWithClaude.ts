import type { Payload } from 'payload'

import {
  type DraftClient,
  claudeApiSettings,
  estimateUsd,
  monthSpend,
  newClient,
  recordSpend,
  requestDraft,
} from '@/lib/ai/claude-api'
import { draftInput } from '@/lib/ai/input'
import { applyDraft } from '@/lib/ai/weekly'
import { errorSummary } from '@/lib/errors'
import { loadTaxonomy } from '@/lib/tags/terms'
import type { Institution } from '@/payload-types'

import { MONITOR_QUEUE, logCounts, maintenanceTask } from './task'

// AI drafts through the Claude API (PLAN §6.6, D52): once a day, after the monitors, a draft for
// each candidate that waits for one, until the month's spend would pass AI_MONTHLY_CAP_USD. Off
// (it does nothing, and says nothing) until both ANTHROPIC_API_KEY and AI_MONTHLY_CAP_USD are set
// (src/lib/ai/claude-api.ts). Each request's cost is recorded as soon as it is known, also for a
// refused or failed one, so the cap holds; the drafts are checked and stored as imported ones are.

/** The most candidates one run drafts. */
const PER_RUN = 40

export type ClaudeCounts = {
  drafted: number
  refused: number
  failed: number
  capReached: number
  spentUsdCents: number
}

export async function draftWithClaude(
  payload: Payload,
  now: Date,
  options: { env?: Record<string, string | undefined>; client?: DraftClient } = {},
): Promise<ClaudeCounts> {
  const counts: ClaudeCounts = {
    drafted: 0,
    refused: 0,
    failed: 0,
    capReached: 0,
    spentUsdCents: 0,
  }
  const settings = claudeApiSettings(options.env)
  if (!settings) return counts
  const client = options.client ?? newClient(settings)
  const taxonomy = await loadTaxonomy(payload)
  const { docs } = await payload.find({
    collection: 'candidates',
    where: {
      and: [
        { status: { in: ['new', 'triaged'] } },
        { kind: { equals: 'job' } },
        { aiSuggestion: { exists: false } },
        { snippet: { exists: true } },
      ],
    },
    sort: 'createdAt',
    depth: 1,
    limit: PER_RUN,
    pagination: false,
  })
  let spent = await monthSpend(payload, now)
  for (const candidate of docs) {
    const institution =
      candidate.institution && typeof candidate.institution === 'object'
        ? (candidate.institution as Institution)
        : null
    const input = draftInput(candidate, institution)
    if (spent + estimateUsd(settings.model, input) > settings.capUsd) {
      counts.capReached = 1
      break
    }
    try {
      const answer = await requestDraft(client, settings, taxonomy, input, now)
      spent += answer.usd
      counts.spentUsdCents += Math.round(answer.usd * 100)
      await recordSpend(payload, now, answer.usd)
      if (answer.refused) {
        counts.refused++
        continue
      }
      const stored = answer.draft
        ? await applyDraft(payload, candidate.id, answer.draft)
        : { outcome: 'invalid' }
      if (stored.outcome === 'applied') counts.drafted++
      else counts.failed++
    } catch (error) {
      counts.failed++
      payload.logger.warn(
        `draftWithClaude: candidate ${candidate.id} failed (${errorSummary(error)})`,
      )
    }
  }
  logCounts(payload, 'draftWithClaude', counts)
  return counts
}

export const DraftWithClaudeTask = maintenanceTask({
  slug: 'draftWithClaude',
  label: 'Draft waiting candidates with the Claude API (off until a key and a cap are set)',
  // Daily at 07:30 UTC, after the monitors (04:40), in their queue.
  cron: '30 7 * * *',
  queue: MONITOR_QUEUE,
  counts: ['drafted', 'refused', 'failed', 'capReached', 'spentUsdCents'],
  run: (payload, now) => draftWithClaude(payload, now),
})
