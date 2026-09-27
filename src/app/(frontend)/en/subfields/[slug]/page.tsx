import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs } from '@/components/Breadcrumbs'
import { NotFoundContent } from '@/components/NotFoundContent'
import { SUBFIELDS_PATH, subfieldPath } from '@/lib/detail-routes'
import { activeSubfields, subfieldBySlug } from '@/lib/records'
import { paths } from '@/lib/site'

// A subfield hub (PLAN §2.2, §16.3). In M3 it is a skeleton: the subfield, its written
// introduction once there is one, and the other subfields. The windows add their items from M4 on.
// The proxy has already answered 404 or 410 for unknown and retired subfields.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const t = await getTranslations({ locale: 'en', namespace: 'subfields' })
  const subfield = await subfieldBySlug(slug, 'en')
  // Only a subfield from the database names the page; never text from the URL.
  if (!subfield?.label) return { robots: { index: false } }
  return {
    title: subfield.label,
    description: t('hubDescription', { subfield: subfield.label }),
    alternates: { canonical: subfieldPath(slug) },
    // Hubs are indexed once they have their written introductions (PLAN §16.3, M3).
    robots: { index: false },
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en' })
  const subfield = await subfieldBySlug(slug, 'en')
  // Only if the subfield disappeared after the proxy checked it; notFound() would render on the
  // client only (CLAUDE.md), so show the 404 content directly.
  if (!subfield) return <NotFoundContent locale="en" kind="notFound" />
  const label = subfield.label ?? slug
  const others = (await activeSubfields('en')).filter((other) => other.slug !== slug)
  const intro = (subfield.hubIntro ?? '').split(/\n\s*\n/).filter((part) => part.trim())

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <Breadcrumbs
          locale="en"
          items={[
            { label: t('subfields.home'), href: paths.home() },
            { label: t('subfields.title'), href: SUBFIELDS_PATH },
            { label },
          ]}
        />
        <h1>{label}</h1>
        {subfield.description && <p className="text-card">{subfield.description}</p>}
        {intro.map((paragraph) => (
          <p key={paragraph}>{paragraph.trim()}</p>
        ))}
        <p className="text-text-muted">{t('subfields.comingSoon')}</p>
        <h2>{t('subfields.others')}</h2>
        <ul role="list">
          {others.map((other) => (
            <li key={other.slug}>
              <a href={subfieldPath(other.slug)}>{other.label}</a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
