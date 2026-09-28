import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { CONTENT_PAGES, type ContentKey, formatDate } from '@/lib/content'
import { contentPageIndexed } from '@/lib/indexing'
import { renderContentFile } from '@/lib/markdown'
import { alternatesFor } from '@/lib/metadata'

// A long-form page from content/ (About, legal texts): title, optional draft notice, the text
// and the date it was last updated.

export async function contentMetadata(key: ContentKey): Promise<Metadata> {
  const page = CONTENT_PAGES[key]
  const t = await getTranslations({ locale: page.locale })
  return {
    title: t(`pages.${page.messages}.title`),
    description: t(`pages.${page.messages}.description`),
    alternates: alternatesFor(page.path),
    // A draft is not indexed and not in the sitemaps (D28).
    ...(contentPageIndexed(page) ? {} : { robots: { index: false } }),
  }
}

export async function ContentPage({ pageKey, intro }: { pageKey: ContentKey; intro?: ReactNode }) {
  const page = CONTENT_PAGES[pageKey]
  setRequestLocale(page.locale)
  const t = await getTranslations({ locale: page.locale })
  const html = renderContentFile(page.file)
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <article className="prose">
        <h1>{t(`pages.${page.messages}.title`)}</h1>
        {page.draft && (
          <p className="draft-notice" role="note">
            {t('pages.draftNotice')}
          </p>
        )}
        {intro}
        <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
        <p className="text-caption text-text-muted">
          {t('pages.updated', { date: formatDate(page.updated, page.locale) })}
        </p>
      </article>
    </main>
  )
}
