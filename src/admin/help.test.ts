import { describe, expect, it } from 'vitest'

import { editorGuideHtml } from './help'

// The guide the admin shows at /admin/help/ (D45): it renders, and its links are ones the site's
// Markdown allows (renderMarkdown stops at any other).

describe('the editor guide in the admin', () => {
  it('renders docs/editor-guide-tr.md with its title and sections', () => {
    const html = editorGuideHtml()
    expect(html).toMatch(/^<h1 id="[^"]+">Gliagora yönetim paneli: editör rehberi<\/h1>/)
    expect(html.match(/<h2 /g)?.length).toBeGreaterThanOrEqual(4)
    expect(html).toContain('Yardım')
  })
})
