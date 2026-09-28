import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { pageWindow } from '@/lib/pagination'

// Pagination of a list (PLAN §7.5): a named navigation with real links, the current page marked,
// Previous and Next, and a window of page numbers (src/lib/pagination.ts). Gaps are drawn by CSS
// and hidden from screen readers.
export async function Pagination({
  locale,
  page,
  pages,
  href,
}: {
  locale: Locale
  page: number
  pages: number
  /** The address of page `n`. */
  href: (n: number) => string
}) {
  if (pages <= 1) return null
  const t = await getTranslations({ locale, namespace: 'pagination' })
  const items = pageWindow(Math.min(page, pages), pages)
  return (
    <nav aria-label={t('label')} className="pagination">
      <ul role="list">
        {page > 1 && page <= pages && (
          <li>
            <a href={href(page - 1)} rel="prev" className="pagination-step">
              {t('previous')}
            </a>
          </li>
        )}
        {items.map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} className="pagination-gap" aria-hidden="true" />
          ) : (
            <li key={item}>
              <a
                href={href(item)}
                aria-label={t('page', { page: item })}
                aria-current={item === page ? 'page' : undefined}
              >
                {item}
              </a>
            </li>
          ),
        )}
        {page < pages && (
          <li>
            <a href={href(page + 1)} rel="next" className="pagination-step">
              {t('next')}
            </a>
          </li>
        )}
      </ul>
    </nav>
  )
}
