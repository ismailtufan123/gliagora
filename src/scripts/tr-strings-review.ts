// Writes docs/tr-strings-review.md, the Turkish interface strings for review (D40): pnpm tr:review
// Reads messages/en.json and messages/tr.json; where each string appears is described in
// ./tr-strings-review-areas.ts. The file keeps its date while its strings stay the same, so
// running the script again changes nothing; a test checks that the file is up to date.
import { readFile, writeFile } from 'node:fs/promises'

import {
  DOC_FILE,
  DOC_PATH,
  MESSAGE_FILES,
  flatten,
  missingPlaces,
  reviewDate,
  reviewDocument,
} from './tr-strings-review-doc'

const read = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'))
const [en, tr] = await Promise.all([read(MESSAGE_FILES.en), read(MESSAGE_FILES.tr)])

const keys = flatten(en).map(([key]) => key)
const missing = missingPlaces(keys)
if (missing.length > 0) {
  console.error(
    `Describe where these keys appear in src/scripts/tr-strings-review-areas.ts, then run pnpm tr:review again:\n${missing.join('\n')}`,
  )
  process.exit(1)
}

const previous = await readFile(DOC_FILE, 'utf8').catch(() => null)
const earlier = previous ? reviewDate(previous) : null
const today = new Date().toISOString().slice(0, 10)
let doc = await reviewDocument({ en, tr, date: earlier ?? today })
if (doc !== previous && earlier !== today) doc = await reviewDocument({ en, tr, date: today })

if (doc === previous) {
  console.log(`${DOC_PATH} is up to date (${keys.length} strings).`)
} else {
  await writeFile(DOC_FILE, doc)
  console.log(`Wrote ${DOC_PATH} (${keys.length} strings).`)
}
