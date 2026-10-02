import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as prettier from 'prettier'

import { AREAS, type Area, PUBLIC_AT_M2, TURKISH_PAGES } from './tr-strings-review-areas'

// Builds docs/tr-strings-review.md (pnpm tr:review, D40): every Turkish interface string of
// messages/tr.json with its English original, where it appears and whether it is on the Turkish
// site now, in one table with the rows grouped by area, for one review pass by a native speaker
// (PLAN §12). The descriptions are in ./tr-strings-review-areas.ts.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** The review file, relative to the repository and on disk. */
export const DOC_PATH = 'docs/tr-strings-review.md'
export const DOC_FILE = path.join(ROOT, DOC_PATH)
export const MESSAGE_FILES = {
  en: path.join(ROOT, 'messages/en.json'),
  tr: path.join(ROOT, 'messages/tr.json'),
}

/** Every string of a messages file by its dotted key (`jobs.filters.apply`), in the file's order. */
export function flatten(messages: unknown, prefix = ''): [string, string][] {
  if (typeof messages === 'string') return [[prefix, messages]]
  if (!messages || typeof messages !== 'object') {
    throw new Error(`Expected text or an object at "${prefix}" in the messages`)
  }
  return Object.entries(messages).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  )
}

type Placed = { area: Area; match: string; where: string; shown: boolean }

const PLACES: Placed[] = AREAS.flatMap((area) =>
  Object.entries(area.places).map(([match, place]) =>
    typeof place === 'string'
      ? { area, match, where: place, shown: area.shown }
      : { area, match, ...place },
  ),
)

const matches = (key: string, match: string) => key === match || key.startsWith(`${match}.`)

/** Where a key appears: the entry with the longest key or prefix that matches it. */
export function placeOf(key: string): Placed | undefined {
  let best: Placed | undefined
  for (const place of PLACES) {
    if (matches(key, place.match) && place.match.length > (best?.match.length ?? -1)) best = place
  }
  return best
}

/** Keys without a description of where they appear. */
export const missingPlaces = (keys: readonly string[]) => keys.filter((key) => !placeOf(key))

/**
 * Descriptions that no key uses any more (the key was renamed or removed). Each key's place is
 * looked up once: looking them all up again for every description took seconds.
 */
export function unusedPlaces(keys: readonly string[]): string[] {
  const used = new Set(keys.map((key) => placeOf(key)))
  return PLACES.filter((place) => !used.has(place)).map((place) => place.match)
}

/** The entry of PUBLIC_AT_M2 for a key (its longest matching key or prefix), if it has one. */
export function publicAtM2(
  key: string,
): { match: string; where: string; onlyAtM2: boolean } | undefined {
  let best: { match: string; where: string; onlyAtM2: boolean } | undefined
  for (const [match, entry] of Object.entries(PUBLIC_AT_M2)) {
    if (matches(key, match) && match.length > (best?.match.length ?? -1)) {
      best =
        typeof entry === 'string'
          ? { match, where: entry, onlyAtM2: false }
          : { match, where: entry.where, onlyAtM2: entry.onlyAtM2 }
    }
  }
  return best
}

/** Entries of PUBLIC_AT_M2 that no key uses (renamed or removed keys). */
export const unusedPublicAtM2 = (keys: readonly string[]) =>
  Object.keys(PUBLIC_AT_M2).filter((match) => !keys.some((key) => publicAtM2(key)?.match === match))

/** Keys or prefixes described in more than one area. */
export const repeatedPlaces = () =>
  PLACES.map((place) => place.match).filter((match, index, all) => all.indexOf(match) !== index)

// Markdown. Placeholders, plural and select blocks ({…} with all they contain) and tags (<link>,
// </link>) are kept exactly, in code spans; the words around them are plain text, escaped where
// Markdown would read them as formatting. Pipes are escaped everywhere, in code spans too, and line
// breaks become <br>, so that every string stays in its table cell.

type Part = { text: string; code: boolean }

/** A message cut into plain text and ICU syntax; adjacent syntax forms one part. */
export function messageParts(message: string): Part[] {
  const parts: Part[] = []
  const push = (text: string, code: boolean) => {
    const last = parts.at(-1)
    if (last && last.code === code) last.text += text
    else parts.push({ text, code })
  }
  let at = 0
  while (at < message.length) {
    if (message[at] === '{') {
      let depth = 0
      let end = at
      for (; end < message.length; end++) {
        if (message[end] === '{') depth++
        else if (message[end] === '}' && --depth === 0) break
      }
      push(message.slice(at, end + 1), true)
      at = end + 1
      continue
    }
    const tag = /^<\/?[A-Za-z][\w-]*>/.exec(message.slice(at))
    if (tag) {
      push(tag[0], true)
      at += tag[0].length
      continue
    }
    push(message[at] as string, false)
    at++
  }
  return parts
}

/** Plain text for a table cell. */
export const escapeText = (text: string) =>
  text.replace(/[\\`*_[\]<>|&~]/g, '\\$&').replace(/\r?\n/g, '<br>')

/** Text in a code span for a table cell, one span per line. */
export function codeSpan(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (line === '') return ''
      const longest = Math.max(0, ...(line.match(/`+/g) ?? []).map((run) => run.length))
      const fence = '`'.repeat(longest + 1)
      const pad = line.startsWith('`') || line.endsWith('`') ? ' ' : ''
      return `${fence}${pad}${line.replace(/\|/g, '\\|')}${pad}${fence}`
    })
    .join('<br>')
}

/** A message for a table cell. */
export const messageCell = (message: string) =>
  messageParts(message)
    .map((part) => (part.code ? codeSpan(part.text) : escapeText(part.text)))
    .join('')

type Row = { key: string; en: string; tr: string; where: string; shown: boolean }

const shownText = (shown: boolean) => (shown ? 'yes' : 'not yet')

function areaStatus(rows: readonly Row[]) {
  const shown = rows.filter((row) => row.shown).length
  if (shown === rows.length) return 'yes'
  if (shown === 0) return 'not yet'
  return `partly (${shown} of ${rows.length})`
}

const plural = (count: number, one: string, other: string) =>
  `${count} ${count === 1 ? one : other}`

/**
 * The review file as Markdown, before formatting. `date` (YYYY-MM-DD) is when the strings last
 * changed: the script keeps the file's date while nothing else changes.
 */
export function buildReview({ en, tr, date }: { en: unknown; tr: unknown; date: string }) {
  const turkish = new Map(flatten(tr))
  const byArea = new Map<Area, (Row & { order: number })[]>(AREAS.map((area) => [area, []]))
  const missing: string[] = []
  for (const [key, english] of flatten(en)) {
    const place = placeOf(key)
    const text = turkish.get(key)
    if (!place || text === undefined) {
      missing.push(key)
      continue
    }
    const order = Object.keys(place.area.places).indexOf(place.match)
    byArea.get(place.area)?.push({ key, en: english, tr: text, ...place, order })
  }
  if (missing.length > 0) {
    throw new Error(
      `No Turkish text or no description of where it appears for: ${missing.join(', ')}. Add the text to messages/tr.json and the description to src/scripts/tr-strings-review-areas.ts.`,
    )
  }
  // Rows in the order of the area's entries, then (stable sort) in the order of the messages.
  const areas = AREAS.map((area, index) => ({
    area,
    heading: `${index + 1}. ${area.title}`,
    rows: (byArea.get(area) ?? []).sort((a, b) => a.order - b.order),
  })).filter(({ rows }) => rows.length > 0)
  const total = areas.reduce((sum, { rows }) => sum + rows.length, 0)
  const shown = areas.reduce((sum, { rows }) => sum + rows.filter((row) => row.shown).length, 0)
  const code = (text: string) => codeSpan(text)
  // The strings public at M2, in the order of PUBLIC_AT_M2, then of the messages.
  const entries = Object.keys(PUBLIC_AT_M2)
  const atM2 = flatten(en)
    .map(([key, english], index) => ({ key, english, index, entry: publicAtM2(key) }))
    .filter(
      (row): row is typeof row & { entry: { match: string; where: string; onlyAtM2: boolean } } =>
        Boolean(row.entry),
    )
    .sort(
      (a, b) =>
        entries.indexOf(a.entry.match) - entries.indexOf(b.entry.match) || a.index - b.index,
    )

  const lines: string[] = [
    '# Turkish interface strings for review',
    '',
    'Every text of the Gliagora interface in Turkish, next to its English original and where it appears, so that a native speaker can review them all in one pass (PLAN §12, D40). Until then the Turkish texts are drafts.',
    '',
    `Updated ${date}: ${plural(total, 'string', 'strings')} in ${plural(areas.length, 'area', 'areas')}, ${shown} of them shown on the Turkish site now.`,
    '',
    `This file is generated from ${code('messages/en.json')} and ${code('messages/tr.json')} by ${code('pnpm tr:review')}; do not edit it by hand. A test fails when it no longer matches the messages.`,
    '',
    '## Public at M2: review these first',
    '',
    `At M2 (D41, D47) the coming-soon page, the newsletter signup, About and the legal texts the operator has approved go public; everything else stays private until the launch. Of these, only the contact page and the two Turkish legal texts (${TURKISH_PAGES.join(', ')}) are in Turkish, each once its text is approved, with a reduced header and footer that link to public pages only. These ${plural(atM2.length, 'string', 'strings')} appear on them; please review them first. About, the newsletter signup and the coming-soon page are in English only at M2, so in Turkish they appear only as the links in that header and footer. The strings below appear again in the full table.`,
    '',
    '| Key | English | Turkish | Where it appears at M2 |',
    '| --- | --- | --- | --- |',
    ...atM2.map(
      (row) =>
        `| ${code(row.key)} | ${messageCell(row.english)} | ${messageCell(turkish.get(row.key) ?? '')} | ${escapeText(row.entry.where)} |`,
    ),
    '',
    '## How to review',
    '',
    `- Start with the section above, then the strings marked **yes** in the last column of the full table: they are on the Turkish site now, on its pages (${TURKISH_PAGES.join(', ')}) with their header, menus and footer. The others belong to pages that exist only in English so far and appear once those pages have Turkish versions; the list of areas below says why.`,
    `- For each correction, note the key (second column) and the corrected Turkish text. Either change the text in ${code('messages/tr.json')} (the key is the path to the text in that file: ${code('jobs.filters.apply')} is ${code('"apply"')} inside ${code('"filters"')} inside ${code('"jobs"')}) and run ${code('pnpm tr:review')}, or send us the list of keys and corrections.`,
    '- Keep the parts in code format as they are (next section).',
    `- Not in this table: the Turkish contact page and the Turkish legal texts (Markdown files in ${code('content/tr/')}), which are reviewed separately, with the legal texts; the About page, which exists only in English so far; and the admin, which is in English only.`,
    '',
    '## Placeholders and tags',
    '',
    'Parts shown in code format are filled in or used by the site. Keep them exactly as they are; you may move them within the sentence, as Turkish word order needs.',
    '',
    `- ${code('{date}')}, ${code('{count}')}, ${code('{name}')} and the like: a value the site fills in (a date, a number, a name, a web address).`,
    `- ${code('<link>')}…${code('</link>')}, and likewise ${code('<email>')}, ${code('<privacy>')}, ${code('<kvkk>')} and ${code('<strong>')}: the words between the two tags become a link (or bold text). Translate the words and keep both tags around them.`,
    `- ${code('{count, plural, =0 {…} one {…} other {…}}')}: chooses the words by a number. ${code('#')} stands for the number; ${code('=0')} is used for zero, ${code('one')} for 1 and ${code('other')} for any other number. Translate only the words inside the inner braces, and keep every branch, even where Turkish uses the same words for 1 and for more.`,
    `- An apostrophe (${code("'")}) directly before ${code('{')}, ${code('}')} or ${code('#')} turns them into plain text; use ${code('’')} there instead.`,
    '',
    '## Areas',
    '',
    'The rows of the table are grouped by these areas, in this order.',
    '',
    ...areas.map(
      ({ area, heading, rows }) =>
        `- **${escapeText(heading)}**: ${plural(rows.length, 'string', 'strings')}, shown on the Turkish site now: ${areaStatus(rows)}. ${escapeText(area.note)}`,
    ),
    '',
    `Total: ${plural(total, 'string', 'strings')}, ${shown} of them shown on the Turkish site now.`,
    '',
    '## Strings',
    '',
    '| Area | Key | English | Turkish | Where it appears | Shown on the Turkish site now |',
    '| --- | --- | --- | --- | --- | --- |',
    ...areas.flatMap(({ heading, rows }) =>
      rows.map(
        (row) =>
          `| ${escapeText(heading)} | ${code(row.key)} | ${messageCell(row.en)} | ${messageCell(row.tr)} | ${escapeText(row.where)} | ${shownText(row.shown)} |`,
      ),
    ),
    '',
    '## Turkish text from other sources',
    '',
    'The interface also shows Turkish text that is not in the messages. None of it is written by hand in the repository, so none of it is listed above:',
    '',
    `- Country names come from the Unicode CLDR (version 48, as built into Node.js) and are stored unchanged in the seed data (${code('src/migrations/data/geography-2026-09.ts')}). Not shown yet: countries appear only on English pages.`,
    `- Dates (such as the date at the end of the Turkish legal pages), numbers, language names (the original language of a job) and time-zone names are written in the page's language by the standard formatting of the server and browser (${code('Intl')}, from the CLDR).`,
    '- The taxonomy (subfields, methods, model systems, position types, career stages) and the country sets are in English only so far; their Turkish labels are entered in the admin with the Turkish site (PLAN §12).',
    '',
  ]
  return lines.join('\n')
}

/**
 * Formats the file as `prettier --check` (pnpm lint) expects it, with the repository's
 * configuration. While `.prettierignore` leaves Markdown to its authors (`*.md`), prettier does not
 * check the file, and it keeps its compact tables: one line per string, so a changed text changes
 * one line (prettier would pad every row of a table to its widest cell).
 */
export async function formatMarkdown(markdown: string, file = DOC_FILE): Promise<string> {
  const { ignored } = await prettier.getFileInfo(file, {
    ignorePath: path.join(ROOT, '.prettierignore'),
  })
  if (ignored) return markdown
  const config = (await prettier.resolveConfig(file)) ?? {}
  return prettier.format(markdown, { ...config, filepath: file })
}

/** The review file, formatted. */
export const reviewDocument = async (input: { en: unknown; tr: unknown; date: string }) =>
  formatMarkdown(buildReview(input))

/** The date a review file names (`Updated YYYY-MM-DD:`), if any. */
export const reviewDate = (doc: string) => /^Updated (\d{4}-\d{2}-\d{2}):/m.exec(doc)?.[1] ?? null
