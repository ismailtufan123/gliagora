import { DomUtils, parseDocument } from 'htmlparser2'

import { fold } from '@/lib/tags/match'

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
// Chrome that is not marked by its element (M7, second round): a site's menu in `<div
// class="parent-menu">` (Champalimaud: every posting named its "Centre for Restorative
// Neurotechnology"), breadcrumbs, a cookie notice, and the teasers of other postings
// (`class="related-vacancies"`: Radboudumc's pages showed a neurology post under every ad).
const CHROME_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'menu', 'menubar', 'search'])
const CHROME_TOKEN =
  /menu|breadcrumb|cookie|^(?:nav|navbar|navigation)(?:$|[-_])|[-_](?:nav|navbar|navigation)$|^(?:related|similar)/i

/** Whether an element is hidden from readers: `hidden`, `aria-hidden`, or a style that hides it. */
function isHidden(element: Element): boolean {
  if (attr(element, 'hidden') !== undefined || attr(element, 'aria-hidden') === 'true') return true
  const style = attr(element, 'style')
  return (
    style !== undefined && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(style)
  )
}

/** The page's own containers, which a class never makes chrome ("menu-open" on a body). */
const CONTAINERS = new Set(['html', 'body', 'main', 'article'])

/** Whether an element is the site's chrome (navigation, menus, related postings), not content. */
function isChrome(element: Element): boolean {
  if (CHROME.has(element.name)) return true
  const role = attr(element, 'role')?.toLowerCase()
  if (role && CHROME_ROLES.has(role)) return true
  if (CONTAINERS.has(element.name) || role === 'main') return false
  const tokens = [...(attr(element, 'class') ?? '').split(/\s+/), attr(element, 'id') ?? '']
  if (!tokens.some((token) => token !== '' && CHROME_TOKEN.test(token))) return false
  // A wrapper an off-canvas menu pushes aside ("menu-push") holds the posting and its heading.
  return !DomUtils.findOne((el) => el.name === 'h1', element.children, true)
}
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
      if (skipChrome && isChrome(node)) continue
      if (isHidden(node)) continue
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

/**
 * What a list's row says about its posting besides the link (M7, second round): that it is closed
 * (IBS: a cell "Closed"; CIBR: a mark "Expired", hidden while the post is open), and, in a table,
 * the cells under a "Closing date" or a "Posted" column, with their headings.
 */
export type RowFacts = {
  closed?: string
  deadline?: { label: string; value: string }
  published?: { label: string; value: string }
}

/** A row's whole short text that says its posting is closed, folded (no accents, lower case). */
const CLOSED_MARKS = new Set(
  [
    'closed',
    'expired',
    'filled',
    'position filled',
    'post filled',
    'recruitment closed',
    'applications closed',
    'no longer open',
    'geschlossen',
    'abgelaufen',
    'besetzt',
    'cloture',
    'cloturee',
    'ferme',
    'fermee',
    'pourvu',
    'cerrado',
    'cerrada',
    'finalizado',
    'finalizada',
    'encerrado',
    'encerrada',
    'chiuso',
    'chiusa',
    'scaduto',
    'scaduta',
    'gesloten',
    'verlopen',
    'vervuld',
    'stangd',
    'avslutad',
    'tillsatt',
    'lukket',
    'besatt',
    'suljettu',
    'kapandi',
    'suresi doldu',
    '停止招聘',
    '招聘结束',
    '已截止',
    '已结束',
    '募集終了',
    '終了',
    '마감',
    '접수마감',
    '모집마감',
  ].map((mark) => fold(mark)),
)

// A table's column headings, folded.
const DEADLINE_HEADING =
  /closing|deadline|apply by|last date|end date|expir|frist|bewerbungsschluss|date limite|date de cloture|fecha limite|plazo|scadenza|sluitingsdatum|sista ansokningsdag|son basvuru|마감|截止|締切|締め切り/
const PUBLISHED_HEADING =
  /posted|published|publication|veroffentlicht|publie|publicado|pubblicat|gepubliceerd|publicerad|ilan tarihi|yayin|등록일|게시일|发布|掲載/

/** The table cells of a row, in order. */
const cellsOf = (row: Element) =>
  (row.children as Node[]).filter(
    (child): child is Element =>
      DomUtils.isTag(child) && (child.name === 'td' || child.name === 'th'),
  )

const oneLine = (nodes: readonly Node[]) =>
  textOf(nodes, { skipChrome: false }).replace(/\s+/g, ' ').trim()

/** The short visible texts of an element and of each visible element in it. */
function shortTexts(element: Element, into: string[] = []): string[] {
  if (isHidden(element) || SKIPPED.has(element.name)) return into
  const text = oneLine([element])
  if (text === '') return into
  if (text.length <= 40) into.push(text)
  for (const child of element.children as Node[]) {
    if (DomUtils.isTag(child)) shortTexts(child, into)
  }
  return into
}

/** What the row of a list's link says about its posting (`RowFacts`). */
function rowFactsOf(anchor: Element): RowFacts {
  let row: Element = anchor
  for (let node = anchor.parent, depth = 0; node && depth < 8; node = node.parent, depth++) {
    if (DomUtils.isTag(node) && (node.name === 'tr' || node.name === 'li')) {
      row = node
      break
    }
  }
  const facts: RowFacts = {}
  const closed = shortTexts(row).find((text) => CLOSED_MARKS.has(fold(text).replace(/[.!:]+$/, '')))
  if (closed) facts.closed = closed
  if (row.name !== 'tr') return facts
  let table: Element | null = null
  for (let node = row.parent; node; node = node.parent) {
    if (DomUtils.isTag(node) && node.name === 'table') {
      table = node
      break
    }
  }
  if (!table) return facts
  const heading = all(
    table,
    (el) => el.name === 'tr' && cellsOf(el).some((cell) => cell.name === 'th'),
  )[0]
  if (!heading || heading === row) return facts
  const headings = cellsOf(heading).map((cell) => oneLine([cell]))
  const cells = cellsOf(row)
  headings.forEach((label, index) => {
    const value = cells[index] ? oneLine([cells[index]]) : ''
    if (!value || value.length > 60) return
    const folded = fold(label)
    if (!facts.deadline && DEADLINE_HEADING.test(folded)) facts.deadline = { label, value }
    else if (!facts.published && PUBLISHED_HEADING.test(folded)) facts.published = { label, value }
  })
  return facts
}

/**
 * Every link of the page, as absolute http(s) addresses without fragments, with its text, and for
 * the links `withRow` names, what their list row says (`RowFacts`).
 */
export function linksOf(
  doc: Doc,
  pageUrl: string,
  withRow: (url: string) => boolean = () => false,
): Array<{ url: string; text: string; row?: RowFacts }> {
  const base = baseOf(doc, pageUrl)
  const result: Array<{ url: string; text: string; row?: RowFacts }> = []
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
    const address = url.toString()
    result.push({
      url: address,
      text: text || (attr(anchor, 'title') ?? '').trim(),
      ...(withRow(address) ? { row: rowFactsOf(anchor) } : {}),
    })
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
): Array<{ url: string; text: string; row: RowFacts }> {
  const result: Array<{ url: string; text: string; row: RowFacts }> = []
  for (const anchor of all(doc, (el) => el.name === 'a' && Boolean(attr(el, 'href')))) {
    const id = idPattern.exec(attr(anchor, 'href')!)?.[1]
    if (!id) continue
    const text = textOf(anchor.children as Node[], { skipChrome: false })
      .replace(/\s+/g, ' ')
      .trim()
    result.push({
      url: template.replace('{id}', encodeURIComponent(id)),
      text,
      row: rowFactsOf(anchor),
    })
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

export type TitleFrom = 'json-ld' | 'og:title' | 'h1' | 'title'

export type PostingPage = {
  title: string | null
  /**
   * Where the title came from. A page whose only title is its `<title>` element ("Job Details" on
   * Oxford's CoreHR) names the posting less well than the list's link.
   */
  titleFrom: TitleFrom | null
  /** Every title the page gives, in this order: its JSON-LD, og:title, the h1, `<title>`. */
  titles: Array<{ from: TitleFrom; value: string }>
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
  const found: Array<[TitleFrom, string | null | undefined]> = [
    ['json-ld', jobPosting?.title],
    ['og:title', metaOf(doc, 'og:title')],
    ['h1', h1 ? textOf(h1.children as Node[], { skipChrome: false }).replace(/\s+/g, ' ') : null],
    ['title', titleElement ? DomUtils.textContent(titleElement).replace(/\s+/g, ' ') : null],
  ]
  const titles = found.flatMap(([from, value]) =>
    value?.trim() ? [{ from, value: value.trim() }] : [],
  )
  const title = titles[0]?.value ?? null
  const titleFrom = titles[0]?.from ?? null
  let text = textOf(contentOf(doc))
  // A page that holds the posting only in its JSON-LD (built by script, with some navigation text
  // around it) still has its description: the longer of the two is the posting. Some sites escape
  // the description's HTML twice.
  if (jobPosting?.description) {
    let description = htmlToText(jobPosting.description)
    if (/<\/?[a-z][a-z0-9]*[\s>/]/i.test(description)) description = htmlToText(description)
    if (description.length > text.length) text = description
  }
  return {
    title,
    titleFrom,
    titles,
    text,
    jobPosting,
    tdmReserved: metaOf(doc, 'tdm-reservation') === '1',
  }
}

/** A title's words, folded, for comparing two titles. */
const titleWords = (value: string) =>
  new Set(
    value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu) ?? [],
  )

/** A list's link of this many words or more names its posting (not "Read more"). */
const LIST_TITLE_WORDS = 3

/**
 * The page's title that names the posting, or null when the list's link (`listTitle`) names it
 * better (M7, second round). A page may put its site's name in og:title and `<title>` (CIBR) or add
 * it to the posting's ("… | Champalimaud Foundation"), so the page's title that agrees best with
 * the list's link wins: the one with the most of its words in the link's. When none agrees, a link
 * of a few words names the posting (the page gives only its site's name); a shorter one ("View")
 * gives way to the page's first title. A page's `<title>` never beats a list's link: on Oxford's
 * CoreHR it is "Job Details". Without a list title (a sitemap's), the page's first title.
 */
export function pageTitleFor(
  page: Pick<PostingPage, 'titles'>,
  listTitle: string | null,
): { value: string; from: TitleFrom } | null {
  if (!listTitle?.trim()) return page.titles[0] ?? null
  const offered = page.titles.filter((title) => title.from !== 'title')
  const listed = titleWords(listTitle)
  let best: { title: (typeof offered)[number]; share: number; shared: number } | null = null
  for (const title of offered) {
    const words = titleWords(title.value)
    if (words.size === 0) continue
    let shared = 0
    for (const word of words) if (listed.has(word)) shared++
    const share = shared / words.size
    // A tie goes to the title that shares more words: a card's link can hold the site's name too.
    if (!best || share > best.share || (share === best.share && shared > best.shared)) {
      best = { title, share, shared }
    }
  }
  const named = listed.size >= LIST_TITLE_WORDS
  if (best && best.share >= 0.5) {
    // A page's title that only adds words to the link's ("…, Careers At Allen Institute") adds
    // its site's name: the link names the posting, unless it was cut short ("…").
    const adds = best.share < 1 && best.shared === listed.size
    return adds && named && !/(?:…|\.\.\.)\s*$/u.test(listTitle) ? null : best.title
  }
  return named ? null : (offered[0] ?? null)
}

/** The text of a page for comparing versions of it (its terms of use): no digits, one line. */
export function comparableText(html: string): string {
  return textOf(contentOf(parseHtml(html)))
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
