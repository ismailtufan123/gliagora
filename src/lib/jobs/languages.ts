// Languages a posting may be written in (ISO 639-1), for the "Original language" fact (PLAN §3.2).
// The labels are for the admin; public pages name languages in the page's language with
// Intl.DisplayNames (`languageName` in ./format.ts).

export const ORIGINAL_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'sq', label: 'Albanian' },
  { value: 'ar', label: 'Arabic' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'ca', label: 'Catalan' },
  { value: 'zh', label: 'Chinese' },
  { value: 'hr', label: 'Croatian' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'et', label: 'Estonian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'is', label: 'Icelandic' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'lv', label: 'Latvian' },
  { value: 'lt', label: 'Lithuanian' },
  { value: 'ms', label: 'Malay' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fa', label: 'Persian' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ro', label: 'Romanian' },
  { value: 'ru', label: 'Russian' },
  { value: 'sr', label: 'Serbian' },
  { value: 'sk', label: 'Slovak' },
  { value: 'sl', label: 'Slovenian' },
  { value: 'es', label: 'Spanish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'vi', label: 'Vietnamese' },
] as const

export type OriginalLanguage = (typeof ORIGINAL_LANGUAGES)[number]['value']

/** The languages of the list that are written right to left. */
const RIGHT_TO_LEFT: ReadonlySet<string> = new Set(['ar', 'fa', 'he'])

/**
 * The `dir` for text in another language, next to its `lang`: `rtl` for a right-to-left language,
 * so an Arabic title ending in "(PhD)" is aligned and ordered as its readers expect on our
 * left-to-right pages, and isolated from the text around it; otherwise none (the page's own).
 */
export const textDirection = (code: string | undefined): 'rtl' | undefined =>
  code && RIGHT_TO_LEFT.has(code) ? 'rtl' : undefined
