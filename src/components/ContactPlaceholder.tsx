import { getTranslations } from 'next-intl/server'

import { Lockup } from '@/components/Lockup'
import type { Locale } from '@/i18n/routing'
import { CONTACT_EMAIL, paths } from '@/lib/site'

// Placeholder until the legal notice is written and reviewed (PLAN §15.4).
export async function ContactPlaceholder({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })
  const email = (chunks: React.ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <Lockup
        size="small"
        href={paths.home()}
        name={t('brand.name')}
        descriptor={t('brand.descriptor')}
      />
      <div className="prose mt-12">
        <h1>{t('contact.title')}</h1>
        <p>{t('contact.inPreparation')}</p>
        <h2>{t('contact.contactHeading')}</h2>
        <p>{t.rich('contact.email', { email })}</p>
      </div>
    </main>
  )
}
