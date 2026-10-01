import { readFileSync } from 'node:fs'
import path from 'node:path'

import { renderMarkdown } from '@/lib/markdown'

export { HELP_PATH } from './help-path'

// The Turkish editor guide (docs/editor-guide-tr.md, D45), shown in the admin at /admin/help/
// behind the "Yardım" link in the side menu, so the editor can read it without GitHub. The file
// is read when the page is shown: the build copies it into the server (next.config.ts,
// outputFileTracingIncludes) and the Docker image keeps it (.dockerignore).

export const EDITOR_GUIDE_FILE = 'docs/editor-guide-tr.md'

/** The guide as HTML (Markdown rendered as for the site's long-form pages). */
export function editorGuideHtml(): string {
  return renderMarkdown(readFileSync(path.join(process.cwd(), EDITOR_GUIDE_FILE), 'utf8'))
}
