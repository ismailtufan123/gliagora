import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Marked, Renderer, type Tokens } from 'marked'

// Long-form pages (About, legal texts) are Markdown files in content/, reviewed through pull
// requests (PLAN §12). They are turned into HTML at build time; the pages are static.

const CONTENT_DIR = path.join(process.cwd(), 'content')

/** URL fragment for a heading: ASCII, lower case, hyphens ("Çerezler ve İzinler" → "cerezler-ve-izinler"). */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Markdown to HTML. Headings get ids for deep links; raw HTML in the source is shown as text. */
export function renderMarkdown(markdown: string): string {
  const used = new Map<string, number>()
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const html = this.parser.parseInline(tokens)
        const base = slugify(html.replace(/<[^>]*>/g, '')) || 'section'
        const count = used.get(base) ?? 0
        used.set(base, count + 1)
        const id = count ? `${base}-${count + 1}` : base
        return `<h${depth} id="${id}">${html}</h${depth}>\n`
      },
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(text)
      },
      // Keyboard users can scroll a wide table because its box can take focus.
      table(token: Tokens.Table) {
        return `<div class="table-scroll" tabindex="0">${Renderer.prototype.table.call(this, token)}</div>\n`
      },
    },
  })
  return marked.parse(markdown, { async: false })
}

/** Reads content/<file> and returns its HTML. */
export function renderContentFile(file: string): string {
  return renderMarkdown(readFileSync(path.join(CONTENT_DIR, file), 'utf8'))
}
