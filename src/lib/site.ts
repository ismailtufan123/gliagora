import type { Locale } from '@/i18n/routing'
import { siteLocale } from '@/i18n/routing'

/** Public origin, used for canonical and alternate links (PLAN §16.1). */
export const SITE_ORIGIN = 'https://gliagora.com'

export const CONTACT_EMAIL = 'hello@gliagora.com'

/** The six windows (PLAN §2.3), in navigation order. */
export const WINDOWS = ['jobs', 'events', 'funding', 'papers', 'news', 'resources'] as const
export type WindowKey = (typeof WINDOWS)[number]

// Paths always end with a slash (PLAN §2.1). Pages that exist only in English link there from
// every locale.
export const paths = {
  home: () => `/${siteLocale}/`,
  window: (key: WindowKey) => `/${siteLocale}/${key}/`,
  contact: (locale: Locale) => (locale === 'tr' ? '/tr/iletisim/' : '/en/contact/'),
}
