import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { SOCIAL_LINKS, WINDOWS, paths } from '@/lib/site'

// PLAN §2.3: sitemap footer (Windows | Learn | About | Legal). The contact and legal notice link
// is on every page (Law 5651, PLAN §15). Profiles elsewhere are plain links (D14).
// About and the legal texts are added to the About column with their pages.
export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })

  const columns = [
    {
      heading: t('footer.windows'),
      links: WINDOWS.map((key) => ({ label: t(`windows.${key}`), href: paths.window(key) })),
    },
    {
      heading: t('footer.learn'),
      links: [
        { label: t('footer.learnBasics'), href: paths.section('learn') },
        { label: t('sections.benchToBedside'), href: paths.section('benchToBedside') },
      ],
    },
    {
      heading: t('footer.about'),
      links: [{ label: t('footer.contact'), href: paths.contact(locale) }],
    },
  ]

  return (
    <footer className="border-t border-line bg-surface-sunken">
      <nav aria-label={t('footer.sitemap')} className="page-frame grid gap-8 py-12 sm:grid-cols-3">
        {columns.map((column) => (
          <div key={column.heading}>
            <h2 className="text-body font-bold">{column.heading}</h2>
            <ul role="list" className="mt-3 grid gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="page-frame flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-line py-6 text-caption">
        <a href={paths.contact(locale)}>{t('footer.contact')}</a>
        <ul role="list" aria-label={t('footer.follow')} className="flex gap-6">
          {SOCIAL_LINKS.map((link) => (
            <li key={link.key}>
              <a href={link.href} rel="me">
                {t(`footer.social.${link.key}`)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
