import { getTranslations } from 'next-intl/server'

import { SearchForm } from '@/components/search/SearchForm'
import type { Locale } from '@/i18n/routing'
import { paths, WINDOWS } from '@/lib/site'

// 404 and 410: what happened, links to the six windows, the search form (M4.9, a plain GET form,
// so it works without JavaScript) and the home page (PLAN §2.5).
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
        <ul role="list" className="flex flex-wrap gap-x-6 gap-y-2">
          {WINDOWS.map((key) => (
            <li key={key}>
              <a href={paths.window(key)}>{t(`windows.${key}`)}</a>
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
