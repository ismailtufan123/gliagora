import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { memberPageIndexed } from '@/lib/indexing'
import { MEMBER_PATHS } from '@/lib/members/paths'

// After asking for a sign-in link (M4b, D49; the M4b design §5): check your inbox. Static, and the
// same for every address and for spam programs (the hidden field leads here too), so it says
// nothing about whether the address has an account. Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.sent' })
  return {
    title: t('metaTitle'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.sent' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose">
        <h1>{t('title')}</h1>
        <p>{t('text')}</p>
        <ul>
          <li>{t('validity')}</li>
          <li>{t('sameBrowser')}</li>
        </ul>
        <p>
          {t.rich('missing', {
            link: (chunks) => <a href={MEMBER_PATHS.signIn}>{chunks}</a>,
          })}
        </p>
      </div>
    </main>
  )
}
