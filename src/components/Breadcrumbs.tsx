import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'

type Crumb = { label: string; href?: string }

// The path to the current page (PLAN §16.2). The last item is the current page and has no link.
export async function Breadcrumbs({ locale, items }: { locale: Locale; items: Crumb[] }) {
  const t = await getTranslations({ locale })
  return (
    <nav aria-label={t('a11y.breadcrumb')} className="breadcrumbs text-caption">
      <ol role="list">
        {items.map((item) => (
          <li key={item.href ?? item.label}>
            {item.href ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
