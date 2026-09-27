import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ContactPlaceholder } from '@/components/ContactPlaceholder'
import { SITE_ORIGIN } from '@/lib/site'

// Contact and legal notice in Turkish (PLAN §2.2, §15.4); the other locale has its own URL.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'tr' })
  return {
    title: t('contact.title'),
    alternates: {
      canonical: '/tr/iletisim/',
      languages: {
        en: `${SITE_ORIGIN}/en/contact/`,
        tr: `${SITE_ORIGIN}/tr/iletisim/`,
        'x-default': `${SITE_ORIGIN}/en/contact/`,
      },
    },
  }
}

export default async function Page() {
  setRequestLocale('tr')
  return <ContactPlaceholder locale="tr" />
}
