import { ExternalLink } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'

// "View original posting" (PLAN §3.2): the way to apply, on the employer's own page. It opens in
// the same tab, like every link on the site; the hidden text says where it leads. No `rel`: the
// link is editorial (an editor checked the page, §6.4) and unpaid, which is what search engines
// expect a followed link to be, and the browser's default referrer policy sends the employer only
// our origin, never the visitor's page or anything about them.
export async function OriginalPostingLink({
  href,
  locale,
  primary = false,
  className = '',
}: {
  href: string
  locale: Locale
  /** The page's main action (the job page); rows use the quieter outlined button. */
  primary?: boolean
  className?: string
}) {
  const t = await getTranslations({ locale, namespace: 'jobs' })
  return (
    <a
      href={href}
      className={`button ${primary ? 'button-primary' : 'button-secondary'} ${className}`}
    >
      {t('viewOriginal')}
      <ExternalLink aria-hidden="true" size={18} className="flex-none" />
      <span className="sr-only"> {t('opensEmployerSite')}</span>
    </a>
  )
}
