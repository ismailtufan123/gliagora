import { DomUtils, parseDocument, parseFeed } from 'htmlparser2'

import { canonicalUrl, isHttpUrl } from '@/lib/jobs/url'
import type { ApiFormat, SourceKind } from '@/lib/sources/kinds'

import { type Fetched, type Fetcher } from './http'
import { htmlToText, idLinksOf, linksOf, metaOf, parseHtml } from './html'

// Reading a source's list (D52): the postings an RSS or Atom feed, a documented API or a vacancy
// list page names, with what the list itself says about each. The posting pages are read later,
// and only for postings that are new (src/lib/monitors/run.ts).

export type ListedPosting = {
  url: string
  canonicalUrl: string
  title: string
  /** Whether `title` is only made from the address (a sitemap's), so any title of the page wins. */
  provisionalTitle?: boolean
  /** Text the list gives: a feed item's summary, or an API's whole posting. */
  text?: string
  /** Whether `text` is the whole posting (an API's), so its page need not be read. */
  complete?: boolean
  /** An API address with the posting's text (SmartRecruiters). */
  detailUrl?: string
  published?: string
  location?: string
}

export type SourceToRead = {
  kind: SourceKind
  url: string
  moreUrls?: readonly string[]
  apiFormat?: ApiFormat | null
  postingPattern?: string | null
  /** A list page whose links name postings by an ID: the ID's pattern and the posting's address. */
  postingIdPattern?: string | null
  postingUrlTemplate?: string | null
}

export type List = {
  postings: ListedPosting[]
  /** Whether a page of the list reserves text and data mining. */
  tdmReserved: boolean
}

/** A list that could not be read as what its source says it is. */
export class ListProblem extends Error {
  constructor(readonly kind: 'not-a-feed' | 'not-json' | 'unexpected-json' | 'not-a-sitemap') {
    super(kind)
    this.name = 'ListProblem'
  }
}

const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1'
const HTML_ACCEPT = 'text/html, application/xhtml+xml;q=0.9, */*;q=0.1'
const JSON_ACCEPT = 'application/json'
const XML_ACCEPT = 'application/xml, text/xml;q=0.9, */*;q=0.1'

/** The largest list read, in bytes. */
const MAX_LIST_BYTES = 8 * 1024 * 1024
/** The most postings taken from one source's list. */
export const MAX_LISTED = 2000
/** The most pages of an API's list read in one run. */
const MAX_API_PAGES = 5
/** The most sitemaps a sitemap index leads to that one run reads. */
const MAX_CHILD_SITEMAPS = 5

const one = (text: string) => text.replace(/\s+/g, ' ').trim()

function json(fetched: Fetched): unknown {
  try {
    return JSON.parse(fetched.text)
  } catch {
    throw new ListProblem('not-json')
  }
}

const asString = (value: unknown) => (typeof value === 'string' ? value : undefined)

function fromFeed(fetched: Fetched): ListedPosting[] {
  const feed = parseFeed(fetched.text, { xmlMode: true })
  if (!feed) throw new ListProblem('not-a-feed')
  return (feed.items ?? []).flatMap((item) => {
    if (!item.link) return []
    let url: string
    try {
      url = new URL(item.link.trim(), fetched.url).toString()
    } catch {
      return []
    }
    return [
      {
        url,
        canonicalUrl: '',
        title: one(htmlToText(item.title ?? '')),
        text: item.description ? htmlToText(item.description) : undefined,
        published: item.pubDate ? item.pubDate.toISOString() : undefined,
      },
    ]
  })
}

function fromPage(
  fetched: Fetched,
  pattern: RegExp | null,
  byId: { idPattern: RegExp; template: string } | null,
): ListedPosting[] {
  const doc = parseHtml(fetched.text)
  const links = (
    byId ? idLinksOf(doc, byId.idPattern, byId.template) : linksOf(doc, fetched.url)
  ).filter((link) => !pattern || pattern.test(link.url))
  // A list often links a posting twice (its title and "Read more"): the longest text names it.
  const byUrl = new Map<string, string>()
  for (const link of links) {
    const known = byUrl.get(link.url)
    if (known === undefined || link.text.length > known.length) byUrl.set(link.url, link.text)
  }
  return [...byUrl].map(([url, text]) => ({ url, canonicalUrl: '', title: text }))
}

/**
 * A provisional title from a posting's address, until its page gives the real one: the last part
 * of the path without its ID, words for hyphens ("Postdoctoral-Researcher_R-4673" → "Postdoctoral
 * Researcher").
 */
export function titleFromAddress(address: string): string {
  let last: string
  try {
    last = decodeURIComponent(new URL(address).pathname.split('/').filter(Boolean).pop() ?? '')
  } catch {
    return ''
  }
  const words = last
    .replace(/\.[a-z]{2,5}$/i, '')
    .replace(/[_-](?:[A-Z]{1,4}-?)?\d{3,}(?:-\d+)?$/, '')
    .replace(/-\d{6,}$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  // An address that is only an ID or a hash names nothing.
  return /\p{L}{3}/u.test(words) && !/^[0-9a-f]{16,}$/i.test(words) ? words : ''
}

/** The postings (`<url><loc>`) and further sitemaps (`<sitemap><loc>`) of a sitemap. */
function fromSitemap(fetched: Fetched): { postings: ListedPosting[]; children: string[] } {
  const doc = parseDocument(fetched.text, { xmlMode: true })
  const named = (name: string) =>
    DomUtils.findAll((el) => el.name.replace(/^.*:/, '').toLowerCase() === name, doc.children)
  const urls = named('urlset')
  const indexes = named('sitemapindex')
  if (urls.length === 0 && indexes.length === 0) throw new ListProblem('not-a-sitemap')
  const locOf = (el: (typeof urls)[number]) => {
    const loc = DomUtils.findOne((child) => child.name.replace(/^.*:/, '') === 'loc', el.children)
    return loc ? DomUtils.textContent(loc).trim() : ''
  }
  const postings = DomUtils.findAll(
    (el) => el.name.replace(/^.*:/, '') === 'url',
    urls.flatMap((set) => set.children),
  ).flatMap((el) => {
    const url = locOf(el)
    return url
      ? [{ url, canonicalUrl: '', title: titleFromAddress(url), provisionalTitle: true }]
      : []
  })
  const children = DomUtils.findAll(
    (el) => el.name.replace(/^.*:/, '') === 'sitemap',
    indexes.flatMap((set) => set.children),
  )
    .map(locOf)
    .filter(Boolean)
  return { postings, children }
}

function fromGreenhouse(data: unknown): ListedPosting[] {
  const jobs = (data as { jobs?: unknown } | null)?.jobs
  if (!Array.isArray(jobs)) throw new ListProblem('unexpected-json')
  return jobs.flatMap((job: Record<string, unknown>) => {
    const url = asString(job.absolute_url)
    if (!url) return []
    // `content` is HTML with its markup escaped once more.
    const content = asString(job.content)
    return [
      {
        url,
        canonicalUrl: '',
        title: one(asString(job.title) ?? ''),
        text: content ? htmlToText(htmlToText(content)) : undefined,
        complete: content !== undefined,
        location: asString((job.location as { name?: unknown } | null)?.name),
        published: asString(job.updated_at),
      },
    ]
  })
}

function fromLever(data: unknown): ListedPosting[] {
  if (!Array.isArray(data)) throw new ListProblem('unexpected-json')
  return data.flatMap((posting: Record<string, unknown>) => {
    const url = asString(posting.hostedUrl)
    if (!url) return []
    const lists = Array.isArray(posting.lists)
      ? (posting.lists as Array<{ text?: unknown; content?: unknown }>)
          .map(
            (list) => `${asString(list.text) ?? ''}\n${htmlToText(asString(list.content) ?? '')}`,
          )
          .join('\n')
      : ''
    const text = [asString(posting.descriptionPlain), lists, asString(posting.additionalPlain)]
      .filter(Boolean)
      .join('\n')
    const created = typeof posting.createdAt === 'number' ? new Date(posting.createdAt) : null
    return [
      {
        url,
        canonicalUrl: '',
        title: one(asString(posting.text) ?? ''),
        text,
        complete: text !== '',
        location: asString((posting.categories as { location?: unknown } | null)?.location),
        published: created && !Number.isNaN(created.getTime()) ? created.toISOString() : undefined,
      },
    ]
  })
}

function fromSmartRecruiters(
  data: unknown,
  listUrl: URL,
): { postings: ListedPosting[]; total: number } {
  const object = data as { content?: unknown; totalFound?: unknown } | null
  if (!Array.isArray(object?.content)) throw new ListProblem('unexpected-json')
  const company = /\/companies\/([^/]+)\/postings/.exec(listUrl.pathname)?.[1]
  const postings = object.content.flatMap((posting: Record<string, unknown>) => {
    const id = asString(posting.id)
    if (!id || !company) return []
    const location = posting.location as { city?: unknown; country?: unknown } | null
    const detail = new URL(listUrl)
    detail.pathname = `${listUrl.pathname.replace(/\/$/, '')}/${encodeURIComponent(id)}`
    detail.search = ''
    return [
      {
        url: `https://jobs.smartrecruiters.com/${company}/${encodeURIComponent(id)}`,
        canonicalUrl: '',
        title: one(asString(posting.name) ?? ''),
        detailUrl: detail.toString(),
        location:
          [asString(location?.city), asString(location?.country)?.toUpperCase()]
            .filter(Boolean)
            .join(', ') || undefined,
        published: asString(posting.releasedDate),
      },
    ]
  })
  return {
    postings,
    total: typeof object.totalFound === 'number' ? object.totalFound : postings.length,
  }
}

/** The text of a SmartRecruiters posting's detail. */
export function smartRecruitersText(data: unknown): string {
  const sections = (data as { jobAd?: { sections?: Record<string, { text?: unknown }> } } | null)
    ?.jobAd?.sections
  if (!sections) return ''
  return Object.values(sections)
    .map((section) => htmlToText(asString(section?.text) ?? ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * `address` without the session a server put into it for a visitor without cookies
 * (`;jsessionid=…`, `?PHPSESSID=…`): otherwise every run would see every posting as new.
 */
export function withoutSession(address: string): string {
  const url = new URL(address)
  url.pathname = url.pathname.replace(/;jsessionid=[^/]*/gi, '')
  for (const name of [...url.searchParams.keys()]) {
    if (/^(?:jsessionid|phpsessid)$/i.test(name)) url.searchParams.delete(name)
  }
  return url.toString()
}

/** Reads the list of `source`. Each address is checked by `allow` (robots.txt) before it is read. */
export async function readList(
  source: SourceToRead,
  fetcher: Fetcher,
  allow: (url: URL) => Promise<boolean>,
): Promise<List> {
  const pattern = source.postingPattern ? new RegExp(source.postingPattern, 'u') : null
  // Only a list page builds addresses from IDs (the fields are the page kind's).
  const byId =
    source.kind === 'page' && source.postingIdPattern && source.postingUrlTemplate
      ? { idPattern: new RegExp(source.postingIdPattern, 'u'), template: source.postingUrlTemplate }
      : null
  let postings: ListedPosting[] = []
  let tdmReserved = false
  const get = (url: string, accept: string) =>
    fetcher.get(url, { accept, maxBytes: MAX_LIST_BYTES, allow, gunzip: accept === XML_ACCEPT })

  if (source.kind === 'rss') {
    const fetched = await get(source.url, FEED_ACCEPT)
    tdmReserved = fetched.tdmReserved
    postings = fromFeed(fetched)
  } else if (source.kind === 'page') {
    for (const url of [source.url, ...(source.moreUrls ?? [])]) {
      const fetched = await get(url, HTML_ACCEPT)
      const reserved =
        fetched.tdmReserved || metaOf(parseHtml(fetched.text), 'tdm-reservation') === '1'
      tdmReserved ||= reserved
      if (reserved) break
      postings.push(...fromPage(fetched, pattern, byId))
    }
  } else if (source.kind === 'sitemap') {
    // A sitemap, or an index of sitemaps (its first few, each checked by robots.txt).
    const queue = [source.url]
    for (let read = 0; queue.length > 0 && read <= MAX_CHILD_SITEMAPS; read++) {
      const fetched = await get(queue.shift()!, XML_ACCEPT)
      tdmReserved ||= fetched.tdmReserved
      if (fetched.tdmReserved) break
      const { postings: some, children } = fromSitemap(fetched)
      postings.push(...some)
      if (read === 0) queue.push(...children.slice(0, MAX_CHILD_SITEMAPS))
    }
  } else if (source.kind === 'api') {
    if (source.apiFormat === 'greenhouse') {
      const fetched = await get(source.url, JSON_ACCEPT)
      postings = fromGreenhouse(json(fetched))
    } else if (source.apiFormat === 'lever') {
      const fetched = await get(source.url, JSON_ACCEPT)
      postings = fromLever(json(fetched))
    } else if (source.apiFormat === 'smartrecruiters') {
      const first = new URL(source.url)
      for (let page = 0; page < MAX_API_PAGES; page++) {
        const url = new URL(first)
        url.searchParams.set('limit', '100')
        url.searchParams.set('offset', String(page * 100))
        const fetched = await get(url.toString(), JSON_ACCEPT)
        const { postings: some, total } = fromSmartRecruiters(json(fetched), first)
        postings.push(...some)
        if (some.length === 0 || (page + 1) * 100 >= total) break
      }
    }
  }

  // Only full http(s) addresses, those of the pattern, each once, in the list's order.
  const seen = new Set<string>()
  const kept: ListedPosting[] = []
  for (const listed of postings) {
    if (!isHttpUrl(listed.url)) continue
    if (pattern && source.kind !== 'page' && !pattern.test(listed.url)) continue
    const posting = { ...listed, url: withoutSession(listed.url) }
    const canonical = canonicalUrl(posting.url)
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)
    kept.push({ ...posting, canonicalUrl: canonical, title: posting.title.slice(0, 300) })
    if (kept.length >= MAX_LISTED) break
  }
  return { postings: kept, tdmReserved }
}
