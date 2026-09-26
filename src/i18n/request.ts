import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'

import { defaultLocale, locales } from './routing'

// Messages for the requested locale (next-intl, PLAN §12). No locale detection or redirects:
// the locale always comes from the URL.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(locales, requested) ? requested : defaultLocale
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'UTC',
  }
})
