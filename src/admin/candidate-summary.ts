import { SOURCE_KINDS } from '@/lib/sources/kinds'

// A candidate's machine data in plain words, for the panel above its JSON fields in the admin
// (src/admin/CandidateSummary.tsx, D57): what a source monitor read from the posting (`extracted`,
// src/lib/sources/facts.ts), the tags the local suggester proposes (`tagSuggestions`,
// src/lib/tags/suggest.ts) and the AI draft (`aiSuggestion`, src/lib/ai/draft.ts), each fact with
// what it came from. Pure, so it can be tested without the admin; it reads the stored values
// loosely (they are JSON), shows what it understands and leaves the rest to the JSON below.
// Plain English, like the rest of the admin.

export type Row = { label: string; value: string; from?: string }
export type Group = { title: string; rows: Row[] }

/** A term's label by vocabulary and slug (`subfield:glia` → "Glial biology"); the slug if unknown. */
export type Labels = (vocabulary: string, slug: string) => string

type Loose = Record<string, unknown>

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const fact = (value: unknown) => (isObject(value) && 'value' in value ? value : null)

/** A calendar day (YYYY-MM-DD) as the admin's readers write it: "30 Nov 2026". */
export function day(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

/** A moment, in UTC: "18 Oct 2026, 07:30 UTC". */
function moment(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const formatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
  return `${formatted} UTC`
}

const PAGE_READ: Record<string, string> = {
  read: 'read',
  'from-api': 'not needed: the facts came with the API',
  robots: 'not read: robots.txt does not allow it',
  pdf: 'not read: the posting is a PDF',
  'not-html': 'not read: not a web page',
  failed: 'not read: it did not answer',
}

const OPEN_ENDED: Record<string, string> = {
  rolling: 'Rolling: applications are read as they come',
  'until-filled': 'Open until filled',
}

const zone = (value: unknown) => text(value) ?? 'no time zone named (it ends Anywhere on Earth)'

function host(url: unknown): string | null {
  const value = text(url)
  if (!value) return null
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

/** What a source monitor read from the posting; null when the candidate has no monitor's facts. */
export function monitorFacts(value: unknown): Group | null {
  if (!isObject(value) || value.version !== 1) return null
  const rows: Row[] = []
  const listed = value.listedOn
  if (isObject(listed)) {
    const kind = SOURCE_KINDS.find((entry) => entry.value === listed.kind)
    const where = host(listed.url)
    rows.push({
      label: 'Listed on',
      value: [kind?.label, where].filter(Boolean).join(', ') || 'a source',
    })
  }
  const page = text(value.page)
  if (page) rows.push({ label: "The posting's page", value: PAGE_READ[page] ?? page })
  const deadline = fact(value.deadline)
  if (deadline && isObject(deadline.value) && text(deadline.value.date)) {
    rows.push({
      label: 'Deadline',
      value: `${day(text(deadline.value.date)!)}, ${zone(deadline.value.timeZone)}`,
      from: text(deadline.from) ?? undefined,
    })
  }
  const openEnded = fact(value.openEnded)
  if (openEnded && text(openEnded.value)) {
    rows.push({
      label: 'No fixed deadline',
      value: OPEN_ENDED[text(openEnded.value)!] ?? text(openEnded.value)!,
      from: text(openEnded.from) ?? undefined,
    })
  }
  if (!deadline && !openEnded) rows.push({ label: 'Deadline', value: 'not found' })
  const location = fact(value.location)
  if (location && text(location.value)) {
    rows.push({
      label: 'Place',
      value: text(location.value)!,
      from: text(location.from) ?? undefined,
    })
  }
  const published = fact(value.published)
  if (published && text(published.value)) {
    rows.push({
      label: 'Published',
      value: day(text(published.value)!),
      from: text(published.from) ?? undefined,
    })
  }
  const filled = fact(value.possiblyFilled)
  if (filled && isObject(filled.value)) {
    const days = typeof filled.value.days === 'number' ? filled.value.days : null
    const since = text(filled.value.published)
    rows.push({
      label: 'Possibly filled',
      value: `No fixed deadline, and published ${since ? day(since) : 'long ago'}${days !== null ? `, ${days} days ago` : ''}: check first that it is still open.`,
      from: text(filled.from) ?? undefined,
    })
  }
  const readAt = text(value.readAt)
  if (readAt) rows.push({ label: 'Read', value: moment(readAt) })
  return { title: 'What the monitor found', rows }
}

const quoted = (words: unknown) =>
  Array.isArray(words)
    ? words
        .map(text)
        .filter((word): word is string => word !== null)
        .map((word) => `“${word}”`)
        .join(', ')
    : ''

/** The terms the local suggester proposes, with the words of the posting they came from. */
export function suggestedTags(value: unknown, labels: Labels): Group | null {
  if (!isObject(value)) return null
  const line = (vocabulary: string, entries: unknown): string => {
    const list = (Array.isArray(entries) ? entries : entries ? [entries] : []).filter(isObject)
    if (list.length === 0) return 'none found'
    return list
      .map((entry) => {
        const slug = text(entry.slug)
        if (!slug) return null
        const words = quoted(entry.words)
        return words ? `${labels(vocabulary, slug)} (${words})` : labels(vocabulary, slug)
      })
      .filter(Boolean)
      .join('; ')
  }
  return {
    title: 'Suggested tags (words of the posting, not AI)',
    rows: [
      { label: 'Subfields', value: line('subfield', value.subfields) },
      { label: 'Methods', value: line('method', value.methods) },
      { label: 'Model systems', value: line('model-system', value.modelSystems) },
      { label: 'Position type', value: line('position-type', value.positionType) },
      { label: 'Career stages', value: line('career-stage', value.careerStages) },
    ],
  }
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function country(code: unknown): string | null {
  const value = text(code)
  if (!value) return null
  try {
    return regionNames.of(value) ?? value
  } catch {
    return value
  }
}

const slugs = (vocabulary: string, value: unknown, labels: Labels) => {
  const list = Array.isArray(value) ? value.map(text).filter((slug) => slug !== null) : []
  return list.length > 0 ? list.map((slug) => labels(vocabulary, slug!)).join('; ') : 'none'
}

/** The AI draft; null when the candidate has none. */
export function aiDraft(value: unknown, labels: Labels): Group | null {
  if (!isObject(value) || value.version !== 1) return null
  const rows: Row[] = []
  const by = value.by === 'claude-api' ? 'the Claude API' : 'Claude Code'
  const at = text(value.at)
  const model = text(value.model)
  rows.push({
    label: 'Written',
    value: [`by ${by}${model ? ` (${model})` : ''}`, at ? `on ${moment(at)}` : null]
      .filter(Boolean)
      .join(' '),
    from: text(value.from) ?? undefined,
  })
  rows.push({ label: 'Summary', value: text(value.summary) ?? 'none' })
  const type = text(value.positionType)
  rows.push({ label: 'Position type', value: type ? labels('position-type', type) : 'not said' })
  const deadline = isObject(value.deadline) ? value.deadline : null
  if (!deadline) {
    rows.push({ label: 'Deadline', value: 'not found' })
  } else {
    const date = text(deadline.date)
    rows.push({
      label: 'Deadline',
      value:
        deadline.kind === 'fixed' && date
          ? `${day(date)}, ${zone(deadline.timeZone)}`
          : (OPEN_ENDED[text(deadline.kind) ?? ''] ?? 'not found'),
      from: text(deadline.from) ?? undefined,
    })
  }
  const place = isObject(value.place) ? value.place : null
  rows.push({
    label: 'Place',
    value: place
      ? [text(place.city), country(place.country)].filter(Boolean).join(', ') || 'not said'
      : 'not said',
    from: place ? (text(place.from) ?? undefined) : undefined,
  })
  rows.push({ label: 'Subfields', value: slugs('subfield', value.subfields, labels) })
  rows.push({ label: 'Career stages', value: slugs('career-stage', value.careerStages, labels) })
  const note = text(value.note)
  if (note) rows.push({ label: 'Note for the editor', value: note })
  return { title: 'AI draft (never shown on the site)', rows }
}

/** Every term the panel names, as `vocabulary:slug`, for one request for their labels. */
export function termKeys(tags: unknown, draft: unknown): string[] {
  const keys = new Set<string>()
  const add = (vocabulary: string, slug: unknown) => {
    const value = text(slug)
    if (value) keys.add(`${vocabulary}:${value}`)
  }
  if (isObject(tags)) {
    const fields: [string, unknown][] = [
      ['subfield', tags.subfields],
      ['method', tags.methods],
      ['model-system', tags.modelSystems],
      ['position-type', tags.positionType],
      ['career-stage', tags.careerStages],
    ]
    for (const [vocabulary, entries] of fields) {
      for (const entry of Array.isArray(entries) ? entries : entries ? [entries] : []) {
        if (isObject(entry)) add(vocabulary, entry.slug)
      }
    }
  }
  if (isObject(draft)) {
    add('position-type', draft.positionType)
    for (const slug of Array.isArray(draft.subfields) ? draft.subfields : []) add('subfield', slug)
    for (const slug of Array.isArray(draft.careerStages) ? draft.careerStages : []) {
      add('career-stage', slug)
    }
  }
  return [...keys]
}
