import type { Payload } from 'payload'

import { type AiDraft, storedDraft } from '@/lib/ai/draft'
import { cannotRedact, draftInput } from '@/lib/ai/input'
import { DRAFT_RULES } from '@/lib/ai/weekly'
import { canonicalUrl } from '@/lib/jobs/url'
import { ageInDays } from '@/lib/monitors/dates'
import { storedFacts } from '@/lib/sources/facts'
import { notResearch } from '@/lib/tags/research'
import { loadTaxonomy } from '@/lib/tags/terms'
import type { Vocabulary } from '@/lib/taxonomy'
import type { Candidate, Institution, Source } from '@/payload-types'

import { DECISION_RULES } from './words'

// The export of "Update the jobs" (D59, docs/update-jobs.md): every waiting candidate (New or
// Triaged) that has an AI draft, with what Claude Code needs to decide it by the written rules:
// the draft input (the title and text redacted again, the monitor's facts, the suggested tags, the
// institution; src/lib/ai/input.ts), the draft, the source's name and kind, and the checks the
// server makes itself. Never a posting's address (only whether it lies on the source's own site),
// an editor's or a suggestion's note or email, or anything about members.

export const DECISIONS_EXPORT_FORMAT = 'gliagora-job-decisions-export/1'

export type ExportedForDecision = {
  id: number
  status: string
  /** The admin page of the candidate, for the operator's questions. */
  adminPath: string
  input: ReturnType<typeof draftInput>
  draft: AiDraft
  source: {
    id: number
    name: string
    kind: string
    severalSites: boolean
    allNeuroscience: boolean
  } | null
  institutionId: number | null
  fromSuggestion: boolean
  /** Whether the posting's address lies on the host of the source's list (an employer's site). */
  onSourceSite: boolean | null
  checks: {
    notResearch: ReturnType<typeof notResearch>
    publishedDaysAgo: number | null
    possiblyFilled: boolean
    possibleDuplicates: number
    /** The candidate was left for the operator by an earlier run (its question is in the admin). */
    askedBefore: boolean
  }
}

export type DecisionsExport = {
  format: typeof DECISIONS_EXPORT_FORMAT
  exportedAt: string
  candidates: ExportedForDecision[]
  /** Waiting candidates without a draft: drafts first (docs/weekly-drafts.md). */
  waitingForDrafts: number
  /** Waiting candidates in a script redaction cannot read: an editor decides them. */
  leftForEditors: number
  /** Waiting candidates without a text (a suggestion not looked at yet): an editor decides them. */
  withoutText: number
  /** Drafted waiting candidates beyond this export's limit: the next export holds them. */
  overLimit: number
  vocabularies: Record<
    'positionType' | 'subfields' | 'careerStages' | 'methods' | 'modelSystems',
    Array<{ slug: string; label: string }>
  >
  draftRules: string[]
  rules: string[]
}

/** The mark a question for the operator starts with, in a candidate's decision note. */
export const QUESTION_MARK = 'Question for the operator'

const hostOf = (address: string | null | undefined) => {
  try {
    const canonical = address ? canonicalUrl(address) : null
    return canonical ? new URL(canonical).hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

/** The waiting candidates to decide, oldest first, `limit` at most. */
export async function exportForDecisions(
  payload: Payload,
  now: Date,
  limit = 500,
): Promise<DecisionsExport> {
  const taxonomy = await loadTaxonomy(payload)
  const terms = (vocabulary: Vocabulary) =>
    [...taxonomy.byKey]
      .filter(([key]) => key.startsWith(`${vocabulary}/`))
      .map(([key, term]) => ({ slug: key.slice(vocabulary.length + 1), label: term.label }))
  const { docs } = await payload.find({
    collection: 'candidates',
    where: { and: [{ status: { in: ['new', 'triaged'] } }, { kind: { equals: 'job' } }] },
    sort: ['createdAt', 'id'],
    depth: 1,
    limit: 5000,
    pagination: false,
  })
  const candidates: ExportedForDecision[] = []
  let waitingForDrafts = 0
  let leftForEditors = 0
  let withoutText = 0
  let overLimit = 0
  for (const candidate of docs as Candidate[]) {
    const institution =
      candidate.institution && typeof candidate.institution === 'object'
        ? (candidate.institution as Institution)
        : null
    const input = draftInput(candidate, institution)
    if (cannotRedact(input)) {
      leftForEditors++
      continue
    }
    const draft = storedDraft(candidate.aiSuggestion)
    if (!draft) {
      if (candidate.snippet) waitingForDrafts++
      else withoutText++
      continue
    }
    if (candidates.length >= limit) {
      overLimit++
      continue
    }
    const source =
      candidate.source && typeof candidate.source === 'object' ? (candidate.source as Source) : null
    const facts = storedFacts(candidate.extracted)
    const published = facts?.published?.value
    const sourceHost = hostOf(source?.url)
    const postingHost = hostOf(candidate.rawUrl)
    candidates.push({
      id: candidate.id,
      status: candidate.status,
      adminPath: `/admin/collections/candidates/${candidate.id}`,
      input,
      draft,
      source: source
        ? {
            id: source.id,
            name: source.name,
            kind: source.kind,
            severalSites: Boolean(source.severalSites),
            allNeuroscience: Boolean(source.allNeuroscience),
          }
        : null,
      institutionId: institution?.id ?? null,
      fromSuggestion: Boolean(candidate.fromSuggestion),
      // The source's own host or one under it: never a guess from the last two parts of a name
      // ("ox.ac.uk" and "jobs.ac.uk" share "ac.uk").
      onSourceSite:
        sourceHost && postingHost
          ? postingHost === sourceHost || postingHost.endsWith(`.${sourceHost}`)
          : null,
      checks: {
        notResearch: notResearch(input.title),
        publishedDaysAgo:
          published && /^\d{4}-\d{2}-\d{2}$/.test(published) ? ageInDays(published, now) : null,
        possiblyFilled: Boolean(facts?.possiblyFilled),
        possibleDuplicates:
          (candidate.possibleDuplicates?.length ?? 0) +
          (candidate.possibleDuplicateCandidates?.length ?? 0),
        askedBefore:
          candidate.status === 'triaged' &&
          (candidate.decisionNote ?? '').startsWith(QUESTION_MARK),
      },
    })
  }
  return {
    format: DECISIONS_EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    candidates,
    waitingForDrafts,
    leftForEditors,
    withoutText,
    overLimit,
    vocabularies: {
      positionType: terms('position-type'),
      subfields: terms('subfield'),
      careerStages: terms('career-stage'),
      methods: terms('method'),
      modelSystems: terms('model-system'),
    },
    draftRules: DRAFT_RULES,
    rules: DECISION_RULES,
  }
}
