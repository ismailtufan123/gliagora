import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NotFoundContent } from '@/components/NotFoundContent'
import { RootDocument } from '@/components/RootDocument'
import { defaultLocale } from '@/i18n/routing'
import { localeMetadata, localeViewport } from '@/lib/metadata'

import { fontVariables } from './(frontend)/fonts'

// 404 for every URL that matches no route (PLAN §2.5): /xyz/, and unknown paths under /en/ and /tr/.
// /admin and /api answer their own 404s (Payload). Rendered without any layout, so it
// brings its own <html>, fonts, styles, favicon and theme colour; it is always in English.
// Next.js adds noindex to it.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: defaultLocale })
  return {
    ...(await localeMetadata(defaultLocale)),
    title: t('meta.titleTemplate', { title: t('notFound.title') }),
  }
}

export const viewport = localeViewport

export default function GlobalNotFound() {
  return (
    <RootDocument locale={defaultLocale} fontVariables={fontVariables}>
      <NotFoundContent locale={defaultLocale} />
    </RootDocument>
  )
}
