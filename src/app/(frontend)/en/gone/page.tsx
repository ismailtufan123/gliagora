import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { NotFoundContent } from '@/components/NotFoundContent'

// Shown with status 410 for removed URLs (src/proxy.ts, src/lib/gone.ts). Not indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en' })
  return { title: t('gone.title'), robots: { index: false } }
}

export default function GonePage() {
  setRequestLocale('en')
  return <NotFoundContent locale="en" kind="gone" />
}
