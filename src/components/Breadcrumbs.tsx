import { getTranslations } from 'next-intl/server'

import { BreadcrumbListJsonLd } from '@/components/JsonLd'
import type { Locale } from '@/i18n/routing'
import { textDirection } from '@/lib/jobs/languages'

type Crumb = { label: string; href?: string; lang?: string }

// The path to the current page (PLAN §7.5), also as BreadcrumbList structured data (§16.2). The
// last item is the current page and has no link. `lang` marks a label in another language, which
// then also gets its writing direction.
export async function Breadcrumbs({ locale, items }: { locale: Locale; items: Crumb[] }) {
  const t = await getTranslations({ locale })
  return (
    <>
      <nav aria-label={t('a11y.breadcrumb')} className="breadcrumbs text-caption">
        <ol role="list">
          {items.map((item) => (
            <li key={item.href ?? item.label}>
              {item.href ? (
                <a href={item.href} lang={item.lang} dir={textDirection(item.lang)}>
                  {item.label}
                </a>
              ) : (
                <span aria-current="page" lang={item.lang} dir={textDirection(item.lang)}>
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <BreadcrumbListJsonLd items={items} />
    </>
  )
}
