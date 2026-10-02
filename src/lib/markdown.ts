import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Marked, Renderer, type TokenizerAndRendererExtension, type Tokens } from 'marked'

import { locales } from '@/i18n/routing'
import { SITE_ORIGIN } from '@/lib/site'

// Long-form pages (About, legal texts) are Markdown files in content/, reviewed through pull
// requests (PLAN §12). They are turned into HTML at build time; the pages are static.

const CONTENT_DIR = path.join(process.cwd(), 'content')

/** URL fragment for a heading: ASCII, lower case, hyphens ("Çerezler ve İzinler" → "cerezler-ve-izinler"). */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The plain text of rendered inline HTML (tags removed, marked's entities decoded). */
const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:quot|#39|lt|gt);/g, ' ')
    .replace(/&amp;/g, ' and ')

// Links may only lead to this site, to web pages or to an email address. Anything else, such as
// javascript: or data: URLs, stops the build instead of reaching a page.
const SAFE_LINK = /^(?:\/(?!\/)|#|https:\/\/|http:\/\/|mailto:)/i

// The pages from content/ link the site's own pages by their paths (`/en/about/`), never by a
// full address (`https://gliagora.com/en/about/`, or an autolink of `www.gliagora.com/…`): a full
// address would skip what the site does with its paths (the M2 versions keep only links to public
// pages, src/lib/m2-links.ts) and lead a local or test build to the live site. (The editor guide in
// the admin names the admin's full address on purpose.)
const SITE_HOST = new URL(SITE_ORIGIN).hostname
const OWN_HOSTS = new Set([SITE_HOST, `www.${SITE_HOST}`])

function checkedHref(href: string, sitePathsOnly: boolean): string {
  if (!SAFE_LINK.test(href)) throw new Error(`Unsafe link in Markdown content: ${href}`)
  if (sitePathsOnly && /^https?:/i.test(href) && OWN_HOSTS.has(new URL(href).hostname)) {
    throw new Error(
      `Link to this site by its full address in Markdown content (write its path): ${href}`,
    )
  }
  return href
}

// Open points in draft texts, "[TO DECIDE: …]" or "[KARAR VERİLECEK: …]", are highlighted so a
// reviewer can find them.
// One level of brackets inside is allowed, e.g. a link: "[TO DECIDE: see [privacy](/en/…) first]".
const MARKER = /^\[(?:TO DECIDE|KARAR VERİLECEK):(?:[^[\]]|\[[^[\]]*\])*\]/
const openPoints: TokenizerAndRendererExtension = {
  name: 'openPoint',
  level: 'inline',
  start: (src) => src.match(/\[(?:TO DECIDE|KARAR VERİLECEK):/)?.index,
  tokenizer(src) {
    const match = MARKER.exec(src)
    if (!match) return undefined
    // Only the text inside the brackets is parsed again, so the marker cannot match itself.
    return {
      type: 'openPoint',
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[0].slice(1, -1)),
    }
  },
  renderer(token) {
    return `<mark class="open-point">[${this.parser.parseInline(token.tokens ?? [])}]</mark>`
  },
}

// A phrase in another language, written "{en: Suggest a listing}" or "{tr: açık rıza}", is marked
// with its language so screen readers pronounce it correctly (WCAG 3.1.2).
const LANGUAGE_PART = new RegExp(`^\\{(${locales.join('|')}): ([^{}]+)\\}`)
const languageParts: TokenizerAndRendererExtension = {
  name: 'languagePart',
  level: 'inline',
  start: (src) => src.match(new RegExp(`\\{(?:${locales.join('|')}): `))?.index,
  tokenizer(src) {
    const match = LANGUAGE_PART.exec(src)
    if (!match) return undefined
    return {
      type: 'languagePart',
      raw: match[0],
      lang: match[1],
      tokens: this.lexer.inlineTokens(match[2] ?? ''),
    }
  },
  renderer(token) {
    return `<span lang="${token.lang}">${this.parser.parseInline(token.tokens ?? [])}</span>`
  },
}

/**
 * Where a link leads instead, or null to show its text without a link: the M2 versions of the
 * pages link only to public pages (src/lib/m2-links.ts, D41).
 */
export type LinkMapper = (href: string) => string | null

export type RenderOptions = {
  link?: LinkMapper
  /** Refuse links to this site by its full address (the pages from content/ do). */
  sitePathsOnly?: boolean
}

/**
 * Markdown to HTML. Headings get ids for deep links; raw HTML in the source is shown as text.
 * `link` changes where links lead; what it gives back is checked like the source's links.
 */
export function renderMarkdown(
  markdown: string,
  { link: mapLink, sitePathsOnly = false }: RenderOptions = {},
): string {
  const checked = (href: string) => checkedHref(href, sitePathsOnly)
  const used = new Map<string, number>()
  const marked = new Marked({
    gfm: true,
    extensions: [openPoints, languageParts],
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const html = this.parser.parseInline(tokens)
        const base = slugify(plainText(html)) || 'section'
        const count = used.get(base) ?? 0
        used.set(base, count + 1)
        const id = count ? `${base}-${count + 1}` : base
        return `<h${depth} id="${id}">${html}</h${depth}>\n`
      },
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(text)
      },
      link(token: Tokens.Link) {
        checked(token.href)
        if (!mapLink) return Renderer.prototype.link.call(this, token)
        const href = mapLink(token.href)
        if (href === null) return this.parser.parseInline(token.tokens)
        return Renderer.prototype.link.call(this, { ...token, href: checked(href) })
      },
      // Images are not used in long-form pages yet; they would need credits (PLAN §7.4).
      image({ href }: Tokens.Image) {
        throw new Error(`Images are not supported in Markdown content: ${href}`)
      },
      // Keyboard users can scroll a wide table because its box can take focus.
      table(token: Tokens.Table) {
        return `<div class="table-scroll" tabindex="0">${Renderer.prototype.table.call(this, token)}</div>\n`
      },
    },
  })
  return marked.parse(markdown, { async: false })
}

/** Reads content/<file> and returns its HTML; its links to this site are paths. */
export function renderContentFile(file: string, options?: RenderOptions): string {
  return renderMarkdown(readFileSync(path.join(CONTENT_DIR, file), 'utf8'), {
    ...options,
    sitePathsOnly: true,
  })
}
