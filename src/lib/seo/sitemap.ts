import { type Locale, locales, siteLocale } from '@/i18n/routing'
import { SITE_ORIGIN } from '@/lib/site'

import { type DateValue, escapeXml, latestDate, w3cDate } from './xml'

// XML sitemaps (PLAN §2.2, §16.1): /sitemap.xml is an index of the files under /sitemaps/, one per
// type of page and, as §12 asks, one per locale: `pages.xml` for English, `pages-tr.xml` once
// Turkish pages are indexed. A file holds at most 50,000 URLs (sitemaps.org); a type with more
// continues in `jobs-2.xml`, `jobs-3.xml`, … Which pages are listed is decided elsewhere
// (src/lib/seo/sitemap-entries.ts, with the pages' own robots rules); this file only writes them.

export const SITEMAP_TYPES = ['pages', 'jobs', 'institutions', 'subfields'] as const
export type SitemapType = (typeof SITEMAP_TYPES)[number]

/** The most URLs one sitemap file may list (sitemaps.org protocol). */
export const MAX_SITEMAP_URLS = 50_000

export type SitemapEntry = {
  /** The page's canonical path, e.g. `/en/about/`. */
  path: string
  /** When the page last changed. Left out where that is not known, rather than guessed. */
  lastmod?: DateValue | null
  /** hreflang alternates (a locale or `x-default` → absolute URL), exactly as on the page. */
  alternates?: Record<string, string>
}

/** What a sitemap file's name says: its type, locale and page (from 1). */
export type SitemapFileKey = { type: SitemapType; locale: Locale; page: number }

export type SitemapFile = SitemapFileKey & { entries: SitemapEntry[] }

/** `jobs.xml`, `jobs-2.xml`, `pages-tr.xml`, `pages-tr-2.xml`: English and page 1 are left out. */
export function sitemapFileName({ type, locale, page }: SitemapFileKey): string {
  return `${type}${locale === siteLocale ? '' : `-${locale}`}${page > 1 ? `-${page}` : ''}.xml`
}

/** The address of a sitemap file on this site. */
export const sitemapPath = (key: SitemapFileKey) => `/sitemaps/${sitemapFileName(key)}`

const isType = (value: string): value is SitemapType =>
  (SITEMAP_TYPES as readonly string[]).includes(value)
const isLocale = (value: string): value is Locale => (locales as readonly string[]).includes(value)

/**
 * The file a name under /sitemaps/ asks for, or null when it names none. Only the spelling
 * `sitemapFileName` writes is accepted, so each file has one address (`jobs-1.xml` and
 * `jobs-en.xml` are not other names for `jobs.xml`).
 */
export function parseSitemapFileName(name: string): SitemapFileKey | null {
  const match = /^([a-z]+)(?:-([a-z]{2}))?(?:-([1-9]\d{0,5}))?\.xml$/.exec(name)
  if (!match) return null
  const [, type = '', locale, page] = match
  if (!isType(type)) return null
  if (locale !== undefined && (!isLocale(locale) || locale === siteLocale)) return null
  if (page === '1') return null
  return { type, locale: (locale as Locale | undefined) ?? siteLocale, page: Number(page ?? 1) }
}

/** The locale of a page: the first segment of its path (`/tr/iletisim/` → `tr`). */
function localeOf(path: string): Locale {
  const segment = path.split('/')[1] ?? ''
  return isLocale(segment) ? segment : siteLocale
}

/**
 * A type's entries as sitemap files: one set per locale (PLAN §12), each cut into files of at
 * most `max` URLs, in the order given. A file exists only when it has entries: the protocol's
 * schema asks a `<urlset>` for at least one `<url>`, so a type or locale with none has no file.
 */
export function splitSitemap(
  type: SitemapType,
  entries: readonly SitemapEntry[],
  max: number = MAX_SITEMAP_URLS,
): SitemapFile[] {
  const byLocale = new Map<Locale, SitemapEntry[]>()
  for (const entry of entries) {
    const locale = localeOf(entry.path)
    const list = byLocale.get(locale)
    if (list) list.push(entry)
    else byLocale.set(locale, [entry])
  }
  return [...byLocale].flatMap(([locale, localeEntries]) => {
    const pages = Math.ceil(localeEntries.length / max)
    return Array.from({ length: pages }, (_, index) => ({
      type,
      locale,
      page: index + 1,
      entries: localeEntries.slice(index * max, (index + 1) * max),
    }))
  })
}

/**
 * The entries of the file a name asks for, or null when it names none. The file right after a
 * locale's last one repeats that file's last entry: an index read a moment earlier (or kept for
 * an hour) may list it, and jobs that close in the meantime can end it before the crawler asks.
 * The entries after a closed job move back by one, so the one that was there is then usually the
 * last of the file before; repeating it keeps the answer a valid `<urlset>`, which needs a URL.
 */
export function sitemapFileEntries(
  files: readonly SitemapFile[],
  key: SitemapFileKey,
): SitemapEntry[] | null {
  const own = files.filter((file) => file.locale === key.locale)
  const file = own.find((candidate) => candidate.page === key.page)
  if (file) return file.entries
  // Pages run from 1 without gaps, so the last file is page `own.length`.
  const last = own.length > 0 && key.page === own.length + 1 ? own.at(-1) : undefined
  return last ? last.entries.slice(-1) : null
}

/** An absolute URL on the public origin, percent-encoded where a path needs it. */
const absolute = (path: string) => new URL(path, SITE_ORIGIN).href

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/** A `<lastmod>` line, or nothing when the date is unknown or not a date. */
function lastmodLine(value: DateValue | null | undefined, indent: string): string[] {
  const date = latestDate([value])
  return date ? [`${indent}<lastmod>${w3cDate(date)}</lastmod>`] : []
}

/**
 * One sitemap file (sitemaps.org 0.9): each page's absolute URL, its `<lastmod>` when known, and
 * its hreflang alternates. The routes write it only with entries (`splitSitemap`).
 */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const hasAlternates = entries.some((entry) => Object.keys(entry.alternates ?? {}).length > 0)
  const lines = [
    XML_DECLARATION,
    `<urlset xmlns="${SITEMAP_NS}"${hasAlternates ? ` xmlns:xhtml="${XHTML_NS}"` : ''}>`,
  ]
  for (const entry of entries) {
    lines.push('  <url>', `    <loc>${escapeXml(absolute(entry.path))}</loc>`)
    lines.push(...lastmodLine(entry.lastmod, '    '))
    for (const [hreflang, href] of Object.entries(entry.alternates ?? {})) {
      lines.push(
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`,
      )
    }
    lines.push('  </url>')
  }
  lines.push('</urlset>', '')
  return lines.join('\n')
}

/**
 * The sitemap index: every file that lists at least one page, without `<lastmod>` (optional in
 * the protocol). A file also changes when a page leaves it (a job closes, an institution loses
 * its last open job, a hub is retired), which the dates of the pages still listed cannot show:
 * their latest date would move back in time just when the file changed.
 */
export function sitemapIndexXml(files: readonly SitemapFile[]): string {
  const lines = [XML_DECLARATION, `<sitemapindex xmlns="${SITEMAP_NS}">`]
  for (const file of files) {
    if (file.entries.length === 0) continue
    lines.push(
      '  <sitemap>',
      `    <loc>${escapeXml(absolute(sitemapPath(file)))}</loc>`,
      '  </sitemap>',
    )
  }
  lines.push('</sitemapindex>', '')
  return lines.join('\n')
}
