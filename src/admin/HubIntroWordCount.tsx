'use client'

import { useFormFields, useLocale } from '@payloadcms/ui'

import { HUB_INTRO_MIN_WORDS, countWords } from '@/lib/indexing'

// Below the hub introduction of a subfield (the Terms collection): how many words it has, counted
// as the robots rule counts them (src/lib/indexing.ts), and how many are missing before search
// engines list the hub (D40). Hubs are English only (/en/subfields/), so only the English
// introduction decides; in another locale the note says so instead. Plain English, like the rest
// of the admin, which is not translated through messages/*.json.

const word = (n: number) => (n === 1 ? 'word' : 'words')

/** The line shown for an introduction of `count` words in the admin locale `locale`. */
export function wordCountNote(count: number, locale: string | undefined): string {
  if (locale !== 'en') {
    return `${count} ${word(count)}. Only the English introduction decides whether search engines list this hub (at least ${HUB_INTRO_MIN_WORDS} words).`
  }
  const missing = HUB_INTRO_MIN_WORDS - count
  return missing > 0
    ? `${count} ${word(count)}: ${missing} more ${word(missing)} before search engines list this hub.`
    : `${count} ${word(count)}: long enough for search engines to list this hub.`
}

export function HubIntroWordCount({ path }: { path: string }) {
  const value = useFormFields(([fields]) => fields[path]?.value)
  // The locale being edited; Payload 3 gives an empty object (or false) without localization.
  const { code } = (useLocale() || {}) as { code?: string }
  return (
    <div className="field-description">
      {wordCountNote(countWords(typeof value === 'string' ? value : null), code)}
    </div>
  )
}
