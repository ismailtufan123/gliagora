import { DomUtils, parseDocument } from 'htmlparser2'

// Reading HTML without a browser (D52: no JavaScript): the links of a vacancy list, and from a
// posting's page its title, its schema.org JobPosting data where the employer gives it, and its
// visible text without navigation, headers and footers.

export type Doc = ReturnType<typeof parseDocument>
type Element = ReturnType<typeof DomUtils.findAll>[number]
type Node = Doc['children'][number]

export function parseHtml(text: string): Doc {
  return parseDocument(text, {
    lowerCaseTags: true,
    lowerCaseAttributeNames: true,
    decodeEntities: true,
  })
}

const all = (doc: Doc | Element, test: (element: Element) => boolean) =>
  DomUtils.findAll(test, 'children' in doc ? doc.children : [])

const attr = (element: Element, name: string) => DomUtils.getAttributeValue(element, name)

/** The page's base address (`<base href>`), or the page's own. */
export function baseOf(doc: Doc, pageUrl: string): URL {
  const base = all(doc, (el) => el.name === 'base' && Boolean(attr(el, 'href')))[0]
  try {
    return new URL(base ? attr(base, 'href')! : pageUrl, pageUrl)
  } catch {
    return new URL(pageUrl)
  }
}

// Elements whose text is not the page's content.
const SKIPPED = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'object',
  'canvas',
  'select',
  'button',
])
const CHROME = new Set(['nav', 'header', 'footer', 'aside', 'form'])
const BLOCKS = new Set([
  'p',
  'div',
  'br',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
  'table',
  'section',
  'article',
  'main',
  'dd',
  'dt',
  'dl',
  'blockquote',
  'pre',
  'hr',
  'figure',
  'figcaption',
  'address',
  'header',
  'footer',
  'nav',
  'aside',
])

/** The visible text of `nodes`, a line for each block, without the page's navigation and chrome. */
export function textOf(nodes: readonly Node[], { skipChrome = true } = {}): string {
  let out = ''
  const walk = (list: readonly Node[]) => {
    for (const node of list) {
      if (node.type === 'text') {
        out += (node as { data: string }).data
        continue
      }
      if (!DomUtils.isTag(node)) continue
      const name = node.name
      if (SKIPPED.has(name)) continue
      if (skipChrome && CHROME.has(name)) continue
      if (attr(node, 'hidden') !== undefined || attr(node, 'aria-hidden') === 'true') continue
      const block = BLOCKS.has(name)
      if (block) out += '\n'
      if (name === 'td' || name === 'th') out += ' '
      walk(node.children as Node[])
      if (block) out += '\n'
    }
  }
  walk(nodes)
  return out
    .replace(/[ \t\f\v ​]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
    .trim()
}

/** The text of an HTML fragment (a feed item's description, an API's posting text). */
export function htmlToText(html: string): string {
  return textOf(parseHtml(html).children, { skipChrome: false })
}

/** Every link of the page, as absolute http(s) addresses without fragments, with its text. */
export function linksOf(doc: Doc, pageUrl: string): Array<{ url: string; text: string }> {
  const base = baseOf(doc, pageUrl)
  const result: Array<{ url: string; text: string }> = []
  for (const anchor of all(doc, (el) => el.name === 'a' && Boolean(attr(el, 'href')))) {
    let url: URL
    try {
      url = new URL(attr(anchor, 'href')!.trim(), base)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    url.hash = ''
    const text = textOf(anchor.children as Node[], { skipChrome: false })
      .replace(/\s+/g, ' ')
      .trim()
    result.push({ url: url.toString(), text: text || (attr(anchor, 'title') ?? '').trim() })
  }
  return result
}

/**
 * The postings of a list whose links name them by an ID instead of an address
 * (`javascript:viewTheJobSpec('188371')`, Oxford's CoreHR): each link whose `href` matches
 * `idPattern` (the ID in its one group) gives the address `template` names with the ID, and its
 * text.
 */
export function idLinksOf(
  doc: Doc,
  idPattern: RegExp,
  template: string,
): Array<{ url: string; text: string }> {
  const result: Array<{ url: string; text: string }> = []
  for (const anchor of all(doc, (el) => el.name === 'a' && Boolean(attr(el, 'href')))) {
    const id = idPattern.exec(attr(anchor, 'href')!)?.[1]
    if (!id) continue
    const text = textOf(anchor.children as Node[], { skipChrome: false })
      .replace(/\s+/g, ' ')
      .trim()
    result.push({ url: template.replace('{id}', encodeURIComponent(id)), text })
  }
  return result
}

/** A `<meta>` value by its name or property. */
export function metaOf(doc: Doc, key: string): string | null {
  const lower = key.toLowerCase()
  const meta = all(
    doc,
    (el) =>
      el.name === 'meta' &&
      (attr(el, 'name')?.toLowerCase() === lower || attr(el, 'property')?.toLowerCase() === lower),
  )[0]
  return meta ? (attr(meta, 'content')?.trim() ?? null) : null
}

/** A schema.org JobPosting as far as the monitor reads it. */
export type JobPostingData = {
  title?: string
  validThrough?: string
  datePosted?: string
  description?: string
  location?: string
}

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

function locationOf(value: unknown): string | undefined {
  const places = Array.isArray(value) ? value : [value]
  const parts: string[] = []
  for (const place of places) {
    const address = (place as { address?: unknown } | null)?.address
    if (typeof address === 'string') parts.push(address)
    else if (address && typeof address === 'object') {
      const a = address as Record<string, unknown>
      const country =
        typeof a.addressCountry === 'string'
          ? a.addressCountry
          : asText((a.addressCountry as { name?: unknown } | null)?.name)
      const line = [asText(a.addressLocality), asText(a.addressRegion), country].filter(Boolean)
      if (line.length > 0) parts.push(line.join(', '))
    }
  }
  return parts.length > 0 ? [...new Set(parts)].join('; ') : undefined
}

/** The JobPosting objects of the page's JSON-LD (also inside `@graph` and lists). */
export function jobPostingsOf(doc: Doc): JobPostingData[] {
  const found: JobPostingData[] = []
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    const object = value as Record<string, unknown>
    const type = object['@type']
    const types = Array.isArray(type) ? type : [type]
    if (types.includes('JobPosting')) {
      found.push({
        title: asText(object.title) ?? asText(object.name),
        validThrough: asText(object.validThrough),
        datePosted: asText(object.datePosted),
        description: asText(object.description),
        location: locationOf(object.jobLocation),
      })
    }
    if (object['@graph']) visit(object['@graph'], depth + 1)
  }
  for (const script of all(
    doc,
    (el) => el.name === 'script' && attr(el, 'type')?.toLowerCase() === 'application/ld+json',
  )) {
    try {
      visit(JSON.parse(DomUtils.textContent(script)), 0)
    } catch {
      // Not JSON: ignored, as a browser would.
    }
  }
  return found
}

/** The element that holds the page's own content, else the body, else the whole document. */
function contentOf(doc: Doc): readonly Node[] {
  for (const test of [
    (el: Element) => el.name === 'main' || attr(el, 'role') === 'main',
    (el: Element) => el.name === 'article',
  ]) {
    const candidates = all(doc, test)
    const best = candidates
      .map((el) => ({ el, size: textOf(el.children as Node[]).length }))
      .sort((a, b) => b.size - a.size)[0]
    if (best && best.size >= 200) return [best.el]
  }
  const body = all(doc, (el) => el.name === 'body')[0]
  return body ? [body] : doc.children
}

export type PostingPage = {
  title: string | null
  /**
   * Where the title came from. A page whose only title is its `<title>` element ("Job Details" on
   * Oxford's CoreHR) names the posting less well than the list's link.
   */
  titleFrom: 'json-ld' | 'og:title' | 'h1' | 'title' | null
  text: string
  jobPosting: JobPostingData | null
  /** Whether the page reserves text and data mining (`<meta name="tdm-reservation" content="1">`). */
  tdmReserved: boolean
}

/** What a posting's page says, as the monitor reads it. */
export function readPostingPage(html: string): PostingPage {
  const doc = parseHtml(html)
  const jobPosting = jobPostingsOf(doc)[0] ?? null
  const h1 = all(doc, (el) => el.name === 'h1')[0]
  const titleElement = all(doc, (el) => el.name === 'title')[0]
  const found: Array<[PostingPage['titleFrom'], string | null | undefined]> = [
    ['json-ld', jobPosting?.title],
    ['og:title', metaOf(doc, 'og:title')],
    ['h1', h1 ? textOf(h1.children as Node[], { skipChrome: false }).replace(/\s+/g, ' ') : null],
    ['title', titleElement ? DomUtils.textContent(titleElement).replace(/\s+/g, ' ') : null],
  ]
  const [titleFrom, title] = found.find(([, value]) => value?.trim()) ?? [null, null]
  let text = textOf(contentOf(doc))
  // A page that holds the posting only in its JSON-LD (built by script) still has its description.
  if (text.length < 200 && jobPosting?.description) text = htmlToText(jobPosting.description)
  return {
    title: title?.trim() || null,
    titleFrom,
    text,
    jobPosting,
    tdmReserved: metaOf(doc, 'tdm-reservation') === '1',
  }
}

/** The text of a page for comparing versions of it (its terms of use): no digits, one line. */
export function comparableText(html: string): string {
  return textOf(contentOf(parseHtml(html)))
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
