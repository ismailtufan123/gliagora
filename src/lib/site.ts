import type { Locale } from '@/i18n/routing'
import { siteLocale } from '@/i18n/routing'

/** Public origin, used for canonical and alternate links (PLAN §16.1). */
export const SITE_ORIGIN = 'https://gliagora.com'

export const CONTACT_EMAIL = 'hello@gliagora.com'

/** For requests about personal data (D9, PLAN §11.6), as the privacy policy says. */
export const PRIVACY_EMAIL = 'privacy@gliagora.com'

/** The six windows (PLAN §2.3), in navigation order. */
export const WINDOWS = ['jobs', 'events', 'funding', 'papers', 'news', 'resources'] as const
export type WindowKey = (typeof WINDOWS)[number]

/** Sections that are not windows but have their own page (PLAN §2.2). */
export const SECTIONS = [
  'map',
  'suggest',
  'learn',
  'benchToBedside',
  'newsletter',
  'about',
] as const
export type SectionKey = (typeof SECTIONS)[number]

const sectionPaths: Record<SectionKey, string> = {
  map: 'map/',
  suggest: 'suggest/',
  learn: 'learn/',
  benchToBedside: 'learn/bench-to-bedside/',
  newsletter: 'newsletter/',
  about: 'about/',
}

// Paths always end with a slash (PLAN §2.1). Pages that exist only in English link there from
// every locale.
export const paths = {
  home: () => `/${siteLocale}/`,
  window: (key: WindowKey) => `/${siteLocale}/${key}/`,
  section: (key: SectionKey) => `/${siteLocale}/${sectionPaths[key]}`,
  contact: (locale: Locale) => (locale === 'tr' ? '/tr/iletisim/' : '/en/contact/'),
  /** The search page (PLAN §2.2); English only, like the windows. */
  search: () => `/${siteLocale}/search/`,
}

/**
 * Pages that exist in more than one locale, as real, reviewed translations (PLAN §2.1). The
 * locale switcher links between them; `hreflang` alternates use the same pairs.
 */
export const TRANSLATIONS: readonly Partial<Record<Locale, string>>[] = [
  { en: '/en/contact/', tr: '/tr/iletisim/' },
]

/** The other locales of a page, from TRANSLATIONS. */
export function translationsOf(path: string): Partial<Record<Locale, string>> {
  return TRANSLATIONS.find((pair) => Object.values(pair).includes(path)) ?? {}
}

type SocialLink = { key: 'instagram' | 'linkedin'; href: string }

/**
 * Profiles on other sites, as plain links only (D14): no embeds, no tracking. Empty until the
 * operator sends the exact addresses (D31); never guess them. The footer and the structured data
 * show them once they are listed here.
 */
export const SOCIAL_LINKS: readonly SocialLink[] = []
