import { JOB_FILTERS, invalidDeadlineRange, parseJobFilters } from '@/lib/filters/jobs'
import { isUnfiltered } from '@/lib/filters/model'
import type { ListingState } from '@/lib/jobs/deadline'

// Which pages search engines may index (PLAN §2.2, §2.5, §16.1). Each page's robots metadata and
// its entry in the sitemaps (src/lib/seo/sitemap-data.ts) come from the same function here, so
// the two cannot disagree: a page is listed exactly when it is indexed.

/** A long-form page from content/ (About, legal texts): indexed once it is no longer a draft (D28). */
export const contentPageIndexed = (page: { draft: boolean }) => !page.draft

/**
 * The jobs list: only its unfiltered first page. Filtered and later pages point to it as their
 * canonical page (PLAN §2.1, §16.1), and so does a range of days the form shows again with an
 * error.
 */
export const jobsListIndexed = (query: URLSearchParams) =>
  isUnfiltered(JOB_FILTERS, parseJobFilters(query)) && !invalidDeadlineRange(query)

/** The world map (PLAN §2.2): indexed, like the unfiltered jobs list it shows on a map. */
export const mapPageIndexed = (): boolean => true

/** A job: while it is open; closed jobs are `noindex` until they answer 410 (PLAN §2.5). */
export const jobIndexed = (state: ListingState) => state === 'open'

/**
 * An institution: while it has at least one open position (PLAN §2.5; upcoming events count too
 * from M8). Without one it answers 200 with `noindex`.
 */
export const institutionIndexed = (openJobs: number) => openJobs > 0

// A word: a letter or digit, then letters, combining marks and digits, joined by an apostrophe
// (' or ’), a hyphen (-, the Unicode hyphens, a soft hyphen), or by . and , between two digits.
// Each part starts with a letter or digit, so a mark with no letter or digit before it (U+FE0F,
// the variation selector after an emoji such as ❤, or a stray accent) is no word.
const WORD =
  /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:(?:['’\u00AD\u2010\u2011-]|(?<=\p{N})[.,](?=\p{N}))[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu

/**
 * The words of a text, in any language. A word is a run of letters or digits (Unicode, with their
 * accents, so Turkish ı, İ, ş and ğ are letters like any other); an apostrophe or a hyphen between
 * two such runs keeps them one word ("Türkiye'nin", "well-known"), and so does a decimal point or
 * thousands separator between digits ("3.5", "1,000"). Punctuation, dashes, symbols and emoji on
 * their own are not words, and the white space between words and paragraphs (blank lines,
 * several spaces) does not matter. Other punctuation separates words, so an abbreviation such as
 * "e.g." or a URL or e-mail address counts one word per run of letters or digits (an introduction
 * is plain prose, so these are rare).
 */
export const countWords = (text: string | null | undefined): number =>
  text?.match(WORD)?.length ?? 0

/** The shortest introduction a hub is indexed with, in words (D40; §16.3 asks for 150–300). */
export const HUB_INTRO_MIN_WORDS = 150

/**
 * A subfield hub: once its human-written introduction has at least 150 words (PLAN §2.2, §16.3,
 * D40). Until then it stays `noindex`: a skeleton of lists, or with a shorter introduction shown
 * all the same. The admin shows the count below the field (src/admin/HubIntroWordCount.tsx).
 */
export const hubIndexed = (subfield: { hubIntro?: string | null }) =>
  countWords(subfield.hubIntro) >= HUB_INTRO_MIN_WORDS

/** The subfield index: once at least one of its hubs is indexed. */
export const subfieldIndexIndexed = (subfields: readonly { hubIntro?: string | null }[]) =>
  subfields.some(hubIndexed)
