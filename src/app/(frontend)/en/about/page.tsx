import { getTranslations } from 'next-intl/server'

import { ContentPage, contentMetadata } from '@/components/ContentPage'
import { Lockup } from '@/components/Lockup'

// About Gliagora (PLAN §9.11); the text is in content/en/about.md.
export const generateMetadata = () => contentMetadata('about')

export default async function Page() {
  const t = await getTranslations({ locale: 'en' })
  return (
    <ContentPage
      pageKey="about"
      intro={<Lockup size="large" name={t('brand.name')} descriptor={t('brand.descriptor')} />}
    />
  )
}
