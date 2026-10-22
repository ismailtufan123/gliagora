import { createHash } from 'node:crypto'

import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { errorSummary } from '@/lib/errors'
import { redacted } from '@/lib/redaction/redact'
import { idOf } from '@/lib/relationship'
import type { ExtractedFacts, Fact } from '@/lib/sources/facts'
import { type PostingOutcome, isAutomatic } from '@/lib/sources/kinds'
import { neuroscienceCheck } from '@/lib/tags/neuroscience'
import { notResearch } from '@/lib/tags/research'
import type { Taxonomy } from '@/lib/tags/terms'
import type { Source } from '@/payload-types'

import {
  type FoundDeadline,
  OPEN_ENDED_MAX_DAYS,
  POSSIBLY_FILLED_DAYS,
  ageInDays,
  dayOf,
  deadlineFromList,
  deadlineFromText,
  deadlineFromValidThrough,
  hasClosed,
  openEndedFromText,
  placeholderDeadline,
  publishedFromAddress,
  publishedFromText,
  reviewDates,
} from './dates'
import { type Fetcher, FetchProblem } from './http'
import { comparableText, pageTitleFor, readPostingPage } from './html'
import { type ListedPosting, ListProblem, readList, smartRecruitersText } from './listing'
import type { RobotsCache } from './robots'

// One run of one source's monitor (D52, PLAN §6.3): robots.txt first; then the list; the postings
// that are new since the last run; for each, its own page where robots.txt allows; the postings in
// neuroscience whose deadline has not passed become candidates (status New), unless the queue or
// the jobs already have the address. Nothing is published. A source that fails is counted, and the
// others go on; a failure three runs in a row flags the source (src/collections/Sources.ts).

export type MonitorDeps = {
  payload: Payload
  fetcher: Fetcher
  robots: RobotsCache
  taxonomy: Taxonomy
  now: Date
  /** The most posting pages one source's run reads; the rest wait for the next run. */
  maxReads?: number
}

export type SourceCounts = {
  listed: number
  new: number
  read: number
  candidates: number
  notNeuroscience: number
  /** Skipped: the title names a post that is not research or research support (M7, third round). */
  notResearch: number
  closed: number
  duplicates: number
  /** Skipped: no fixed deadline, and published over OPEN_ENDED_MAX_DAYS ago. */
  old: number
  /** New postings over the cap of one run (`maxReads`); read on the next run. */
  capped: number
  /** Postings whose page failed this time; read again on the next run. */
  failedPages: number
}

export type SourceResult = {
  id: number
  outcome: 'ok' | 'failed' | 'refused' | 'skipped'
  counts: SourceCounts
  /** A failure's kind and HTTP status, never a page's text. */
  error?: string
}

export const MAX_READS = 40

/** The longest source text kept on a candidate (redacted), in characters. */
export const SNIPPET_MAX = 8000

const POSTING_ACCEPT = 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1'
const MAX_POSTING_BYTES = 4 * 1024 * 1024

/** The terms page is read again after this many days. */
const TERMS_EVERY_DAYS = 7

export const emptyCounts = (): SourceCounts => ({
  listed: 0,
  new: 0,
  read: 0,
  candidates: 0,
  notNeuroscience: 0,
  notResearch: 0,
  closed: 0,
  duplicates: 0,
  old: 0,
  capped: 0,
  failedPages: 0,
})

const db = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

const problemText = (error: unknown) =>
  error instanceof FetchProblem || error instanceof ListProblem
    ? error.message
    : errorSummary(error)

/** Updates the monitor's record on the source (the source's own hook sets "Needs attention"). */
async function record(payload: Payload, id: number, data: Partial<Source>) {
  await payload.update({ collection: 'sources', id, data, depth: 0, context: { monitor: true } })
}

/** `(a, b, c)`: values as parameters. */
const valueList = (values: readonly string[]) =>
  sql`(${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`

/** Canonical addresses this source's monitor has seen before, among `addresses`. */
async function seenBefore(
  payload: Payload,
  source: number,
  addresses: string[],
): Promise<Set<string>> {
  const seen = new Set<string>()
  for (let i = 0; i < addresses.length; i += 500) {
    const chunk = addresses.slice(i, i + 500)
    const { rows } = await db(payload).execute<{ canonical_url: string }>(sql`
      SELECT canonical_url FROM source_postings
      WHERE source_id = ${source} AND canonical_url IN ${valueList(chunk)}`)
    for (const row of rows) seen.add(row.canonical_url)
  }
  return seen
}

/** Notes that the postings of `addresses` are still listed. */
async function stillListed(payload: Payload, source: number, addresses: string[], now: Date) {
  for (let i = 0; i < addresses.length; i += 500) {
    const chunk = addresses.slice(i, i + 500)
    await db(payload).execute(sql`
      UPDATE source_postings SET last_seen_at = ${now.toISOString()}, updated_at = ${now.toISOString()}
      WHERE source_id = ${source} AND canonical_url IN ${valueList(chunk)}`)
  }
}

/** Canonical addresses among `addresses` that a candidate or a job already has. */
async function alreadyKnown(payload: Payload, addresses: string[]): Promise<Set<string>> {
  const known = new Set<string>()
  if (addresses.length === 0) return known
  for (const collection of ['candidates', 'jobs'] as const) {
    const { docs } = await payload.find({
      collection,
      where: { canonicalUrl: { in: addresses } },
      select: { canonicalUrl: true },
      depth: 0,
      limit: addresses.length * 2,
      pagination: false,
    })
    for (const doc of docs) if (doc.canonicalUrl) known.add(doc.canonicalUrl)
  }
  return known
}

async function remember(
  payload: Payload,
  source: number,
  posting: ListedPosting,
  outcome: PostingOutcome,
  now: Date,
  candidate?: number,
  /** The title as its own page gives it, when the page was read. */
  title?: string,
) {
  await payload.create({
    collection: 'source-postings',
    data: {
      source,
      canonicalUrl: posting.canonicalUrl,
      url: posting.url,
      title: redacted(title || posting.title)?.slice(0, 300) || null,
      outcome,
      candidate: candidate ?? null,
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    },
    depth: 0,
  })
}

type Posting = {
  title: string
  titleFrom: string
  text: string
  page: ExtractedFacts['page']
  validThrough?: string
  location?: Fact<string>
  published?: Fact<string>
}

/** A day the list or the posting's data gives as published, with where it came from. */
function listedDay(
  value: string | undefined,
  from: string,
  now: Date,
  country: string | null,
): Fact<string> | undefined {
  const day = dayOf(value, now, country)
  return day ? { value: day, from: `${from}: ${value}` } : undefined
}

/**
 * The names whose words do not count as neuroscience in a posting's text (src/lib/tags/
 * neuroscience.ts): the source's own list (one a line) and its employer's names.
 */
export function ignoredNamesOf(source: Source): string[] {
  const names = (source.ignoredNames ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const institution = source.institution
  if (institution && typeof institution === 'object') {
    names.push(institution.name, ...(institution.aliases ?? []))
  }
  return names
}

/** Reads what the monitor needs of one posting; null when its page is gone (a 404 or 410). */
async function readPosting(
  deps: MonitorDeps,
  posting: ListedPosting,
  country: string | null,
): Promise<Posting | null> {
  const listed: Posting = {
    title: posting.title,
    titleFrom: 'the list',
    text: posting.text ?? '',
    page: 'from-api',
    location: posting.location ? { value: posting.location, from: 'the list' } : undefined,
    published: listedDay(posting.published, 'the list', deps.now, country),
  }
  if (posting.complete) return listed
  const allow = (url: URL) => deps.robots.allows(url)
  if (posting.detailUrl) {
    const fetched = await deps.fetcher.get(posting.detailUrl, {
      accept: 'application/json',
      maxBytes: MAX_POSTING_BYTES,
      allow,
    })
    let data: unknown = null
    try {
      data = JSON.parse(fetched.text)
    } catch {
      throw new ListProblem('not-json')
    }
    return { ...listed, text: smartRecruitersText(data) }
  }
  if (/\.pdf(?:$|[?#])/i.test(new URL(posting.url).pathname)) return { ...listed, page: 'pdf' }
  if (!(await allow(new URL(posting.url)))) return { ...listed, page: 'robots' }
  let fetched
  try {
    fetched = await deps.fetcher.get(posting.url, {
      accept: POSTING_ACCEPT,
      maxBytes: MAX_POSTING_BYTES,
      allow,
    })
  } catch (error) {
    if (error instanceof FetchProblem && (error.status === 404 || error.status === 410)) return null
    if (error instanceof FetchProblem && error.kind === 'refused')
      return { ...listed, page: 'robots' }
    throw error
  }
  const type = fetched.contentType.toLowerCase()
  if (type.includes('pdf')) return { ...listed, page: 'pdf' }
  if (type && !type.includes('html')) return { ...listed, page: 'not-html' }
  const page = readPostingPage(fetched.text)
  if (fetched.tdmReserved || page.tdmReserved) return { ...listed, page: 'robots' }
  // The page's title that agrees with the list's link: a page may give only its site's name.
  const pageTitle = pageTitleFor(page, posting.provisionalTitle ? null : posting.title)?.value
  return {
    title: pageTitle ?? posting.title,
    titleFrom: pageTitle ? "the posting's page" : 'the list',
    text: page.text || listed.text,
    page: 'read',
    validThrough: page.jobPosting?.validThrough,
    location: page.jobPosting?.location
      ? { value: page.jobPosting.location, from: "the posting's JobPosting data" }
      : listed.location,
    published:
      listedDay(page.jobPosting?.datePosted, "the posting's JobPosting data", deps.now, country) ??
      listed.published,
  }
}

/** What a source's run made of one new posting. */
async function handlePosting(
  deps: MonitorDeps,
  source: Source,
  country: string | null,
  posting: ListedPosting,
  counts: SourceCounts,
): Promise<void> {
  const { payload, now } = deps
  // The list itself says the posting is closed (IBS's "Closed", CIBR's "Expired"): not read.
  if (posting.closedInList) {
    counts.closed++
    await remember(payload, source.id, posting, 'closed', now)
    return
  }
  let read: Posting | null
  try {
    read = await readPosting(deps, posting, country)
  } catch (error) {
    counts.failedPages++
    payload.logger.warn(
      `monitor: source ${source.id}: a posting's page failed (${problemText(error)})`,
    )
    return
  }
  counts.read++
  if (read === null) {
    counts.closed++
    await remember(payload, source.id, posting, 'closed', now)
    return
  }
  // Never the address as a title: the report on the monitors shows titles, never addresses.
  const title = (read.title || posting.title || '').slice(0, 300)
  if (!source.allNeuroscience) {
    const check = neuroscienceCheck(
      { title, text: read.text },
      deps.taxonomy.compiled,
      ignoredNamesOf(source),
    )
    if (!check.matches) {
      counts.notNeuroscience++
      await remember(payload, source.id, posting, 'not-neuroscience', now, undefined, title)
      return
    }
  }
  // An administrative, nursing, clinical-only, teaching or business post, or no posting at all,
  // also at a whole neuroscience institute (D59: research and research-support positions only).
  if (notResearch(title)) {
    counts.notResearch++
    await remember(payload, source.id, posting, 'not-research', now, undefined, title)
    return
  }
  // The posting's own words win over an earlier validThrough, which some systems fill with the
  // first review date (UC Recruit: "Next review date" in the data, "Final date: …" in the text).
  // UC Recruit writes its first review date into `validThrough`: a review date is no deadline.
  const reviews = reviewDates(read.text, country, now)
  const validThrough = deadlineFromValidThrough(read.validThrough, now)
  const fromData =
    (validThrough && !reviews.has(validThrough.date) ? validThrough : null) ??
    deadlineFromList(posting.listedDeadline, country, now)
  const fromText = deadlineFromText(read.text, country, now)
  const deadline: FoundDeadline | null =
    fromData && fromText && fromText.date > fromData.date ? fromText : (fromData ?? fromText)
  if (deadline && hasClosed(deadline.date, now)) {
    counts.closed++
    await remember(payload, source.id, posting, 'closed', now, undefined, title)
    return
  }
  // When it was published, wherever the source says: its data, the list, its address, its text.
  // Only a day given as data may skip a posting as old; one read from the text only marks it.
  const fromAddress = publishedFromAddress(posting.url, now)
  const postedInText = publishedFromText(read.text, country, now)
  const published: Fact<string> | undefined =
    read.published ??
    (fromAddress
      ? { value: fromAddress.date, from: fromAddress.from }
      : postedInText
        ? { value: postedInText.date, from: redacted(postedInText.from) ?? postedInText.from }
        : undefined)
  const asData = Boolean(read.published ?? fromAddress)
  const age = published && !deadline ? ageInDays(published.value, now) : null
  if (age !== null && asData && age > OPEN_ENDED_MAX_DAYS) {
    counts.old++
    await remember(payload, source.id, posting, 'old', now, undefined, title)
    return
  }
  // A placeholder far ahead ("31/12/2035") means rolling; a posting that gives only review dates
  // is open until filled.
  const openEnded = deadline
    ? null
    : (openEndedFromText(read.text) ??
      placeholderDeadline(read.text, read.validThrough, country, now) ??
      (reviews.size > 0
        ? {
            value: 'until-filled' as const,
            from: 'the text gives a review date but no deadline',
          }
        : null))
  const facts: ExtractedFacts = {
    version: 1,
    readAt: now.toISOString(),
    listedOn: { kind: source.kind, url: source.url },
    page: read.page,
    title: { value: redacted(title) ?? '', from: read.titleFrom },
    ...(deadline
      ? {
          deadline: {
            value: { date: deadline.date, timeZone: deadline.timeZone },
            from: redacted(deadline.from) ?? deadline.from,
          },
        }
      : {}),
    ...(openEnded
      ? { openEnded: { value: openEnded.value, from: redacted(openEnded.from) ?? '' } }
      : {}),
    ...(read.location ? { location: read.location } : {}),
    ...(published ? { published } : {}),
    ...(published && age !== null && age >= POSSIBLY_FILLED_DAYS
      ? {
          possiblyFilled: {
            value: { published: published.value, days: age },
            from: `no fixed deadline, and published ${age} days ago: check first that it is still open`,
          },
        }
      : {}),
  }
  const snippet = redacted(read.text)?.slice(0, SNIPPET_MAX) ?? null
  const candidate = await payload.create({
    collection: 'candidates',
    data: {
      kind: 'job',
      status: 'new',
      source: source.id,
      institution: (idOf(source.institution) as number | undefined) ?? null,
      rawUrl: posting.url,
      // Redacted like the text: a title can name a lab's head (M7, third round).
      rawTitle: redacted(title)?.slice(0, 300) || null,
      snippet,
      extracted: facts,
    },
    depth: 0,
    context: { monitor: true },
  })
  counts.candidates++
  await remember(payload, source.id, posting, 'candidate', now, Number(candidate.id), title)
}

/** The note on the source about its robots.txt. */
function robotsNoteFor(answer: Awaited<ReturnType<RobotsCache['answerFor']>>): string {
  if (answer.state === 'allow-all') return 'No robots.txt: everything is allowed.'
  if (answer.state === 'disallow-all') return `Not read: ${answer.reason}.`
  const delay = answer.rules.crawlDelay
  return `Allowed${delay ? `, with ${delay} s between requests` : ''}.`
}

/** Runs the monitor of one source. Failures are recorded on the source, never thrown. */
export async function runSource(deps: MonitorDeps, source: Source): Promise<SourceResult> {
  const { payload, now } = deps
  const counts = emptyCounts()
  if (!isAutomatic(source.kind)) return { id: source.id, outcome: 'skipped', counts }
  const at = now.toISOString()
  const listUrl = new URL(source.url)
  const answer = await deps.robots.answerFor(listUrl)
  const robotsNote = robotsNoteFor(answer)
  if (!(await deps.robots.allows(listUrl))) {
    await record(payload, source.id, {
      lastRunAt: at,
      robotsAllowed: false,
      robotsCheckedAt: at,
      robotsNote:
        answer.state === 'rules'
          ? 'Not read: robots.txt disallows the list for Gliagora-Monitor.'
          : robotsNote,
    })
    return { id: source.id, outcome: 'refused', counts }
  }

  let list
  try {
    list = await readList(
      {
        kind: source.kind,
        url: source.url,
        moreUrls: (source.moreUrls ?? []).map((row) => row.url),
        apiFormat: source.apiFormat,
        postingPattern: source.postingPattern,
        postingIdPattern: source.postingIdPattern,
        postingUrlTemplate: source.postingUrlTemplate,
      },
      deps.fetcher,
      (url) => deps.robots.allows(url),
    )
  } catch (error) {
    if (error instanceof FetchProblem && error.kind === 'refused') {
      await record(payload, source.id, {
        lastRunAt: at,
        robotsAllowed: false,
        robotsCheckedAt: at,
        robotsNote: 'Not read: the list redirects to an address that robots.txt disallows.',
      })
      return { id: source.id, outcome: 'refused', counts }
    }
    const message = `the list: ${problemText(error)}`
    await record(payload, source.id, {
      lastRunAt: at,
      robotsAllowed: true,
      robotsCheckedAt: at,
      robotsNote,
      consecutiveFailures: (source.consecutiveFailures ?? 0) + 1,
      lastError: message,
    })
    return { id: source.id, outcome: 'failed', counts, error: message }
  }
  if (list.tdmReserved) {
    await record(payload, source.id, {
      lastRunAt: at,
      robotsAllowed: false,
      robotsCheckedAt: at,
      robotsNote: 'Not read: the site reserves text and data mining (tdm-reservation).',
    })
    return { id: source.id, outcome: 'refused', counts }
  }

  counts.listed = list.postings.length
  const addresses = list.postings.map((posting) => posting.canonicalUrl)
  const seen = await seenBefore(payload, source.id, addresses)
  await stillListed(payload, source.id, [...seen], now)
  const fresh = list.postings.filter((posting) => !seen.has(posting.canonicalUrl))
  counts.new = fresh.length
  const batch = fresh.slice(0, deps.maxReads ?? MAX_READS)
  counts.capped = fresh.length - batch.length
  const known = await alreadyKnown(
    payload,
    batch.map((posting) => posting.canonicalUrl),
  )
  const institution = source.institution
  const country =
    institution && typeof institution === 'object'
      ? ((idOf(institution.country) as string | undefined) ?? null)
      : null

  for (const posting of batch) {
    try {
      if (known.has(posting.canonicalUrl)) {
        counts.duplicates++
        await remember(payload, source.id, posting, 'duplicate', now)
        continue
      }
      await handlePosting(deps, source, country, posting, counts)
    } catch (error) {
      // A candidate or record that could not be saved: the posting is read again next time.
      counts.failedPages++
      payload.logger.warn(
        `monitor: source ${source.id}: a posting could not be saved (${errorSummary(error)})`,
      )
    }
  }

  await record(payload, source.id, {
    lastRunAt: at,
    lastSuccessAt: at,
    robotsAllowed: true,
    robotsCheckedAt: at,
    robotsNote,
    consecutiveFailures: 0,
    lastError: null,
    lastRunFound: counts.candidates,
    candidatesFound: (source.candidatesFound ?? 0) + counts.candidates,
  })
  return { id: source.id, outcome: 'ok', counts }
}

/**
 * Reads the source's terms page once a week and notes when its text changed since an editor last
 * read the terms (D52: the terms are followed; the editor reads them again when they change).
 */
export async function checkTerms(
  deps: MonitorDeps,
  source: Source,
): Promise<'changed' | 'same' | 'skipped' | 'failed'> {
  if (!source.termsUrl || !isAutomatic(source.kind)) return 'skipped'
  const fetchedAt = source.termsFetchedAt ? Date.parse(source.termsFetchedAt) : 0
  if (deps.now.getTime() - fetchedAt < TERMS_EVERY_DAYS * 86_400_000) return 'skipped'
  try {
    const url = new URL(source.termsUrl)
    if (!(await deps.robots.allows(url))) return 'skipped'
    const fetched = await deps.fetcher.get(source.termsUrl, {
      accept: POSTING_ACCEPT,
      maxBytes: MAX_POSTING_BYTES,
      allow: (next) => deps.robots.allows(next),
    })
    const hash = createHash('sha256').update(comparableText(fetched.text)).digest('hex')
    const reviewed = source.termsReviewedHash ?? hash
    const changed = hash !== reviewed
    await record(deps.payload, source.id, {
      termsHash: hash,
      termsReviewedHash: reviewed,
      termsFetchedAt: deps.now.toISOString(),
      ...(changed && !source.termsChangedAt ? { termsChangedAt: deps.now.toISOString() } : {}),
    })
    return changed ? 'changed' : 'same'
  } catch {
    return 'failed'
  }
}
