import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { memberPageIndexed } from '@/lib/indexing'
import { ACCOUNT_SECTIONS, MEMBER_PATHS } from '@/lib/members/paths'

// After asking for a link to add an address to the account (M4b, D49; the M4b design §5, §7.4):
// check your inbox. Static, and the same whether or not the address belongs to another account and
// for spam programs (the hidden field leads here too). Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'account.email.sent' })
  return {
    title: t('metaTitle'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'account.email.sent' })
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
            link: (chunks) => (
              <a href={`${MEMBER_PATHS.account}#${ACCOUNT_SECTIONS.email}`}>{chunks}</a>
            ),
          })}
        </p>
      </div>
    </main>
  )
}
