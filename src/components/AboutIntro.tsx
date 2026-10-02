import { getTranslations } from 'next-intl/server'

import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/JsonLd'
import { Lockup } from '@/components/Lockup'

/**
 * Above the About page's text (PLAN §9.11): the large lockup, with the site's structured data
 * (PLAN §16.2). Shared by the page and its M2 version.
 */
export async function AboutIntro() {
  const t = await getTranslations({ locale: 'en' })
  return (
    <>
      <Lockup size="large" name={t('brand.name')} descriptor={t('brand.descriptor')} />
      <OrganizationJsonLd />
      <WebSiteJsonLd />
    </>
  )
}
