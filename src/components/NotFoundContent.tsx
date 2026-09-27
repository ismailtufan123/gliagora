import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { paths, WINDOWS } from '@/lib/site'

// 404: links to the six windows and the home page (PLAN §2.5). Search is added with M4.
export async function NotFoundContent({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.text')}</p>
        <ul role="list" className="flex flex-wrap gap-x-6 gap-y-2">
          {WINDOWS.map((key) => (
            <li key={key}>
              <a href={paths.window(key)}>{t(`windows.${key}`)}</a>
            </li>
          ))}
        </ul>
        <p>
          <a href={paths.home()}>{t('notFound.home')}</a>
        </p>
      </div>
    </main>
  )
}
