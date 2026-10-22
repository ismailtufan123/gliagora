import { canonicalUrl } from '@/lib/jobs/url'
import { fold } from '@/lib/tags/match'

import { type Fetcher, FetchProblem } from './http'
import { type PostingPage, readPostingPage } from './html'
import type { RobotsCache } from './robots'

// The weekly link check (PLAN §6.3, D52): each published job's original page, read as the monitors
// read (robots.txt, the user agent, the pauses). A page that is gone (404, 410), that fails, that
// redirects elsewhere or that says the position is filled or closed goes on the dashboard for the
// editor; nothing is closed automatically.

export type LinkStatus = 'ok' | 'redirect' | 'broken' | 'gone'

export type LinkCheck = {
  /** The new link status, or null when the page could not be checked (robots.txt). */
  status: LinkStatus | null
  /** The words of the page that say the position is filled or closed, if any. */
  saysClosed: string | null
  /** What the check found, for the editor: an HTTP status, a redirect, the words. */
  note: string
}

/** Words that say a posting is no longer open, folded (lower case, no accents). */
const CLOSED = [
  'position has been filled',
  'position is filled',
  'position is now filled',
  'post has been filled',
  'vacancy has been filled',
  'role has been filled',
  'this position is no longer available',
  'this job is no longer available',
  'this vacancy is no longer available',
  'job is no longer available',
  'no longer accepting applications',
  'applications are now closed',
  'applications are closed',
  'applications have closed',
  'this vacancy is closed',
  'this vacancy has closed',
  'this job has closed',
  'the closing date has passed',
  'this posting has expired',
  'this job has expired',
  'job posting has expired',
  'this advert has expired',
  'recruitment has closed',
  'stelle ist bereits besetzt',
  'stelle wurde bereits besetzt',
  'stelle ist besetzt',
  'bewerbungsfrist ist abgelaufen',
  'ausschreibung ist beendet',
  'nicht mehr verfugbar',
  'poste est pourvu',
  'poste a ete pourvu',
  "offre n'est plus disponible",
  'offre expiree',
  'plaza cubierta',
  'la oferta ha expirado',
  'convocatoria cerrada',
  'vacature is vervuld',
  'vacature is gesloten',
  'tjansten ar tillsatt',
  'ansokningstiden har gatt ut',
  'stillingen er besatt',
  'posizione e stata coperta',
  'bando scaduto',
]

const CLOSED_RE = new RegExp(
  `(?<![\\p{L}])(?:${CLOSED.map((phrase) => phrase.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}])`,
  'gu',
)

/**
 * Words before a phrase that make it a condition, not a fact: "open until the position is
 * filled", "unless the vacancy has been filled", "applications close once the post is filled"
 * (M7, third round: the first "Update the jobs" took five open postings for filled ones).
 */
const CONDITION =
  /\b(?:until|till|unless|before|once|when|whenever|if|as soon as|after|bis|tant que|jusqu'a ce que|hasta que|fino a|tot)\b[^.!?\n]{0,40}$/u

/** The words of `text` that say the position is filled or closed, as written, or null. */
export function closedWords(text: string): string | null {
  const folded = fold(text)
  for (const match of folded.matchAll(CLOSED_RE)) {
    if (CONDITION.test(folded.slice(Math.max(0, match.index - 60), match.index))) continue
    return text.slice(match.index, match.index + match[0].length).replace(/\s+/g, ' ')
  }
  return null
}

const PAGE_ACCEPT = 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1'
const MAX_PAGE_BYTES = 4 * 1024 * 1024

/** Checks one original posting's page. */
export async function checkLink(
  fetcher: Fetcher,
  robots: RobotsCache,
  address: string,
): Promise<LinkCheck> {
  const { page: _page, ...check } = await lookAt(fetcher, robots, address)
  return check
}

/**
 * The link check of one page, with the page as read when it answered with HTML: the last look of
 * "Update the jobs" before a job is published (D59) reads its deadline there too.
 */
export async function lookAt(
  fetcher: Fetcher,
  robots: RobotsCache,
  address: string,
): Promise<LinkCheck & { page?: PostingPage }> {
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return { status: 'broken', saysClosed: null, note: 'Not a valid address.' }
  }
  if (!(await robots.allows(url))) {
    return { status: null, saysClosed: null, note: 'Not checked: robots.txt does not allow it.' }
  }
  try {
    const fetched = await fetcher.get(address, {
      accept: PAGE_ACCEPT,
      maxBytes: MAX_PAGE_BYTES,
      allow: (next) => robots.allows(next),
    })
    const moved = canonicalUrl(fetched.url) !== canonicalUrl(address)
    const type = fetched.contentType.toLowerCase()
    const page = !type || type.includes('html') ? readPostingPage(fetched.text) : undefined
    const words = page ? closedWords(page.text) : null
    const notes = [
      moved ? `Redirects to ${fetched.url}` : null,
      words ? `The page says: "${words}"` : null,
    ].filter(Boolean)
    return {
      status: moved ? 'redirect' : 'ok',
      saysClosed: words,
      note: notes.length > 0 ? `${notes.join('. ')}.` : 'The page answers.',
      ...(page ? { page } : {}),
    }
  } catch (error) {
    if (error instanceof FetchProblem) {
      if (error.kind === 'refused') {
        return {
          status: null,
          saysClosed: null,
          note: 'Not checked: it redirects to an address robots.txt does not allow.',
        }
      }
      if (error.status === 404 || error.status === 410) {
        return {
          status: 'gone',
          saysClosed: null,
          note: `The page is gone (HTTP ${error.status}).`,
        }
      }
      return {
        status: 'broken',
        saysClosed: null,
        note: `The page did not answer: ${error.message}.`,
      }
    }
    return { status: 'broken', saysClosed: null, note: 'The page did not answer.' }
  }
}
