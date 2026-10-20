import { getTranslations } from 'next-intl/server'

import { SearchForm } from '@/components/search/SearchForm'
import type { Locale } from '@/i18n/routing'
import { NAV_PAGES } from '@/lib/navigation'
import { LIVE_WINDOWS, paths } from '@/lib/site'

// 404 and 410: what happened, links to the main parts (the windows that are built, the map, the
// subfields and About, as in the header, D55), the search form (M4.9, a plain GET form, so it
// works without JavaScript) and the home page (PLAN §2.5).
export async function NotFoundContent({
  locale,
  kind = 'notFound',
}: {
  locale: Locale
  kind?: 'notFound' | 'gone'
}) {
  const t = await getTranslations({ locale })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t(`${kind}.title`)}</h1>
        <p>{t(`${kind}.text`)}</p>
        {/* A row of links, without the bullets .prose gives its lists: they read as dots between
            the words (PLAN §7.6). */}
        <ul role="list" className="flex list-none flex-wrap gap-x-6 gap-y-2 ps-0">
          {LIVE_WINDOWS.map((key) => (
            <li key={key}>
              <a href={paths.window(key)}>{t(`windows.${key}`)}</a>
            </li>
          ))}
          {NAV_PAGES.map(({ key, href }) => (
            <li key={key}>
              <a href={href}>{key === 'subfields' ? t('subfields.title') : t(`sections.${key}`)}</a>
            </li>
          ))}
        </ul>
        {/* Its own field id: the header's search dialog, on every page, has search-dialog-input. */}
        <SearchForm inputId="not-found-q" label={t('search.label')} submit={t('search.submit')} />
        <p>
          <a href={paths.home()}>{t(`${kind}.home`)}</a>
        </p>
      </div>
    </main>
  )
}
