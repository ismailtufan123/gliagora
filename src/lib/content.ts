import type { Locale } from '@/i18n/routing'

// Long-form pages kept as Markdown in content/ (PLAN §12), rendered by ContentPage.
// Titles and descriptions are in messages/{locale}.json under `pages.<key>`.
// `updated` is the date of the last change to the text; change it with the text.
// `draft: true` shows a "draft" notice and keeps the page out of search engines. A legal text
// leaves draft only after the operator has approved it (CLAUDE.md).

type ContentPageInfo = {
  locale: Locale
  path: string
  file: string
  updated: string
  draft: boolean
}

export const CONTENT_PAGES = {
  about: {
    locale: 'en',
    path: '/en/about/',
    file: 'en/about.md',
    updated: '2026-09-27',
    draft: false,
  },
} as const satisfies Record<string, ContentPageInfo>

export type ContentKey = keyof typeof CONTENT_PAGES

/** "27 September 2026" / "27 Eylül 2026": unambiguous dates (PLAN §12). */
export function formatDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}
