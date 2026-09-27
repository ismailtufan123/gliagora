import type { Validate } from 'payload'

/**
 * For localized text that every document needs in English (the default locale) but that may be
 * left empty in Turkish, where it falls back to English (PLAN §12). Payload's `required` would
 * demand a Turkish value too, so saving anything with the Turkish admin language selected would
 * fail until someone typed a translation. New documents must be created in English, so they
 * always have an English value.
 */
export const requiredInEnglish =
  (message = 'Enter the English text.'): Validate<string> =>
  (value, { req, operation }) => {
    const locale = req.locale ?? 'en'
    // Reading or writing every locale at once (`locale: 'all'`) passes an object; not used by the admin.
    if (locale === 'all') return true
    if (locale === 'en') {
      return (typeof value === 'string' && value.trim() !== '') || message
    }
    if (operation === 'create') {
      return 'Create new items with the admin language set to English, then add the Turkish text.'
    }
    return true
  }
