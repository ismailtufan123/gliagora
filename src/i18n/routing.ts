// Locales (PLAN §2.1, §12). Every public URL starts with /{locale}/. English is the full site;
// Turkish exists only for the Turkish legal pages until the Turkish locale gate (PLAN §3.4).
export const locales = ['en', 'tr'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

/** Locales in which the whole site (windows, About, …) exists. Other locales link to these. */
export const siteLocale: Locale = 'en'
