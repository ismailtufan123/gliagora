import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { siteLocale } from '@/i18n/routing'
import type { SectionKey, WindowKey } from '@/lib/site'
import { CONTACT_EMAIL, WINDOWS, paths } from '@/lib/site'

// Stand-in pages for the windows and sections that are not built yet, so that every link in the
// header and footer leads somewhere (PLAN §2.3). Not indexed. Each is replaced by the real page
// in the milestone that builds it (PLAN §20).

type Section = WindowKey | SectionKey

async function titleOf(section: Section) {
  const t = await getTranslations({ locale: siteLocale })
  return (WINDOWS as readonly string[]).includes(section)
    ? t(`windows.${section as WindowKey}`)
    : t(`sections.${section as SectionKey}`)
}

export async function placeholderMetadata(section: Section): Promise<Metadata> {
  return { title: await titleOf(section), robots: { index: false } }
}

export async function PlaceholderPage({ section }: { section: Section }) {
  setRequestLocale(siteLocale)
  const t = await getTranslations({ locale: siteLocale })
  const email = (chunks: React.ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{await titleOf(section)}</h1>
        <p>{t('placeholder.text')}</p>
        <p>{t.rich('placeholder.contact', { email })}</p>
        <p>
          <a href={paths.home()}>{t('placeholder.home')}</a>
        </p>
      </div>
    </main>
  )
}
