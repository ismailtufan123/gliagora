import { describe, expect, it } from 'vitest'

import { renderMarkdown, slugify } from './markdown'

describe('slugify', () => {
  it('makes ASCII fragments from English and Turkish headings', () => {
    expect(slugify('Who Gliagora is for')).toBe('who-gliagora-is-for')
    expect(slugify('Çerezler ve İzinler')).toBe('cerezler-ve-izinler')
    expect(slugify('Kişisel verilerin aktarılması (m. 8–9)')).toBe(
      'kisisel-verilerin-aktarilmasi-m-8-9',
    )
    expect(slugify('Ğ Ş Ü Ö ı')).toBe('g-s-u-o-i')
  })
})

describe('renderMarkdown', () => {
  it('gives headings unique ids', () => {
    const html = renderMarkdown('## Rights\n\ntext\n\n## Rights\n\n### *Your* rights')
    expect(html).toContain('<h2 id="rights">Rights</h2>')
    expect(html).toContain('<h2 id="rights-2">Rights</h2>')
    expect(html).toContain('<h3 id="your-rights"><em>Your</em> rights</h3>')
  })

  it('shows raw HTML as text instead of rendering it', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script>\n\n<div onclick="x()">block</div>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<div')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders tables, lists and links', () => {
    const html = renderMarkdown(
      '| A | B |\n|---|---|\n| 1 | 2 |\n\n1. one\n2. two\n\n[Contact](/en/contact/)',
    )
    expect(html).toContain('<div class="table-scroll" tabindex="0"><table>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<a href="/en/contact/">Contact</a>')
  })
})
