import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'

import type { LocaleLabels } from './LocaleSwitcher'

/** The language menu's texts in the page's locale, for the full and the reduced header. */
export async function localeLabels(locale: Locale): Promise<LocaleLabels> {
  const t = await getTranslations({ locale })
  return {
    heading: t('locale.heading'),
    button: t('locale.button', {
      name: t(`locale.names.${locale}`),
      code: t(`locale.short.${locale}`),
    }),
    moreComing: t('locale.moreComing'),
    names: { en: t('locale.names.en'), tr: t('locale.names.tr') },
    short: { en: t('locale.short.en'), tr: t('locale.short.tr') },
  }
}
