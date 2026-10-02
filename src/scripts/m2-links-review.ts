// Writes docs/m2-links-review.md, how the links of the texts from content/ read in the M2 state
// (D41, D50): pnpm m2:links. Run it after changing a text or src/lib/m2-links.ts; a test fails
// until then. Running it again changes nothing.
import { readFile, writeFile } from 'node:fs/promises'

import { DOC_FILE, DOC_PATH, linksReview } from './m2-links-review-doc'

const doc = linksReview()
const previous = await readFile(DOC_FILE, 'utf8').catch(() => null)
if (doc === previous) {
  console.log(`${DOC_PATH} is up to date.`)
} else {
  await writeFile(DOC_FILE, doc)
  console.log(`Wrote ${DOC_PATH}.`)
}
