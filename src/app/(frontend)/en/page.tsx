import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Lockup } from '@/components/Lockup'
import { CONTACT_EMAIL } from '@/lib/site'

// Coming-soon page (M0), until the home page of M6. English only (PLAN §12). Static HTML and CSS.
export default async function ComingSoonPage() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })

  return (
    <main id="main" className="page-frame grid flex-1 content-center gap-8 py-12">
      <h1>
        <Lockup size="large" name={t('brand.name')} descriptor={t('brand.descriptor')} />
      </h1>
      <p className="max-w-[14ch] font-display text-hero leading-[1.02] font-bold tracking-[-0.01em]">
        {t('brand.tagline')}
      </p>
      <div className="grid max-w-measure gap-4 text-card">
        <p>{t('home.comingSoon')}</p>
        <p>
          {t.rich('home.writeToUs', {
            email: (chunks) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>,
          })}
        </p>
      </div>
    </main>
  )
}
