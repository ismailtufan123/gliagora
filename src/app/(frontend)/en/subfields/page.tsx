import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { SUBFIELDS_PATH, subfieldPath } from '@/lib/detail-routes'
import { activeSubfields } from '@/lib/records'
import { paths } from '@/lib/site'

// All subfields (PLAN §4.2), each linking to its hub. Read from the database on every request.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'subfields' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: SUBFIELDS_PATH },
    // Hubs are indexed once they have their written introductions (PLAN §16.3, M3).
    robots: { index: false },
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })
  const subfields = await activeSubfields('en')
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <Breadcrumbs
          locale="en"
          items={[
            { label: t('subfields.home'), href: paths.home() },
            { label: t('subfields.title') },
          ]}
        />
        <h1>{t('subfields.title')}</h1>
        <p>{t('subfields.intro')}</p>
      </div>
      <ul role="list" className="mt-8 grid max-w-(--measure) gap-4">
        {subfields.map((subfield) => (
          <li key={subfield.slug}>
            <a href={subfieldPath(subfield.slug)} className="font-bold">
              {subfield.label}
            </a>
            {subfield.description && (
              <p className="text-caption text-text-muted">{subfield.description}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
