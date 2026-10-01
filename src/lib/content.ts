import type { Locale } from '@/i18n/routing'

// Long-form pages kept as Markdown in content/ (PLAN §12), rendered by ContentPage.
// Titles and descriptions are in messages/{locale}.json under `pages.<messages>`, read in the
// page's own locale (the English and Turkish contact pages share `pages.contact`).
// `updated` is the date of the last change to the text; change it with the text.
// `draft: true` shows a "draft" notice and keeps the page out of search engines. A legal text
// leaves draft only after the operator has approved it (CLAUDE.md).

type ContentPageInfo = {
  locale: Locale
  messages:
    | 'about'
    | 'contact'
    | 'privacy'
    | 'kvkk'
    | 'acikRiza'
    | 'cookies'
    | 'terms'
    | 'takedown'
    | 'dataRequests'
  path: string
  file: string
  updated: string
  draft: boolean
}

export const CONTENT_PAGES = {
  about: {
    locale: 'en',
    messages: 'about',
    path: '/en/about/',
    file: 'en/about.md',
    updated: '2026-10-01',
    draft: false,
  },
  // Legal texts (PLAN §15.4): drafts for the operator's review, written in M1 and, for the
  // açık rıza metni, cookies, takedown and data requests, before the lawyer review (D32).
  contact: {
    locale: 'en',
    messages: 'contact',
    path: '/en/contact/',
    file: 'en/contact.md',
    updated: '2026-09-28',
    draft: true,
  },
  iletisim: {
    locale: 'tr',
    messages: 'contact',
    path: '/tr/iletisim/',
    file: 'tr/iletisim.md',
    updated: '2026-09-28',
    draft: true,
  },
  privacy: {
    locale: 'en',
    messages: 'privacy',
    path: '/en/legal/privacy/',
    file: 'en/legal/privacy.md',
    updated: '2026-09-28',
    draft: true,
  },
  kvkk: {
    locale: 'tr',
    messages: 'kvkk',
    path: '/tr/legal/kvkk-aydinlatma-metni/',
    file: 'tr/legal/kvkk-aydinlatma-metni.md',
    updated: '2026-09-28',
    draft: true,
  },
  acikRiza: {
    locale: 'tr',
    messages: 'acikRiza',
    path: '/tr/legal/acik-riza-metni/',
    file: 'tr/legal/acik-riza-metni.md',
    updated: '2026-09-27',
    draft: true,
  },
  cookies: {
    locale: 'en',
    messages: 'cookies',
    path: '/en/legal/cookies/',
    file: 'en/legal/cookies.md',
    updated: '2026-09-27',
    draft: true,
  },
  terms: {
    locale: 'en',
    messages: 'terms',
    path: '/en/legal/terms/',
    file: 'en/legal/terms.md',
    updated: '2026-10-01',
    draft: true,
  },
  takedown: {
    locale: 'en',
    messages: 'takedown',
    path: '/en/legal/takedown/',
    file: 'en/legal/takedown.md',
    updated: '2026-09-28',
    draft: true,
  },
  dataRequests: {
    locale: 'en',
    messages: 'dataRequests',
    path: '/en/legal/data-requests/',
    file: 'en/legal/data-requests.md',
    updated: '2026-09-27',
    draft: true,
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
