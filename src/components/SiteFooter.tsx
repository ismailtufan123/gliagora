import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import type { Locale } from '@/i18n/routing'
import { CONTENT_PAGES } from '@/lib/content'
import { isPublicAddress } from '@/lib/public-pages'
import type { SiteStage } from '@/lib/site-stage'
import { CONTACT_EMAIL, SOCIAL_LINKS, WINDOWS, paths } from '@/lib/site'

// PLAN §2.3: sitemap footer (Windows | Learn | About | Legal). The contact and legal notice link
// is on every page (Law 5651, PLAN §15). Profiles elsewhere are plain links (D14).
// The columns follow PLAN §2.3 (the sources and editorial policy in About, the accessibility
// statement last in Legal); the Turkish texts carry hrefLang="tr".
// In the M2 state (D41 (4), D50) the footer of the public pages links to public pages only: About,
// and the contact page and the legal texts once each is approved (src/lib/public-pages.ts); no
// Windows or Learn. Until the contact page is approved, its place at the bottom gives the address
// to write to instead.

type FooterLink = { label: string; href: string; hrefLang?: string }

export async function SiteFooter({
  locale,
  stage = 'private',
}: {
  locale: Locale
  stage?: SiteStage
}) {
  const t = await getTranslations({ locale })
  const m2 = stage === 'm2'
  const shown = (link: { href: string }) => !m2 || isPublicAddress(link.href)

  const legal: FooterLink[] = [
    { label: t('pages.privacy.title'), href: CONTENT_PAGES.privacy.path },
    { label: t('pages.kvkk.title'), href: CONTENT_PAGES.kvkk.path, hrefLang: 'tr' },
    { label: t('pages.acikRiza.title'), href: CONTENT_PAGES.acikRiza.path, hrefLang: 'tr' },
    { label: t('pages.cookies.title'), href: CONTENT_PAGES.cookies.path },
    { label: t('pages.terms.title'), href: CONTENT_PAGES.terms.path },
    { label: t('pages.takedown.title'), href: CONTENT_PAGES.takedown.path },
    { label: t('pages.dataRequests.title'), href: CONTENT_PAGES.dataRequests.path },
    { label: t('pages.accessibility.title'), href: CONTENT_PAGES.accessibility.path },
  ].filter(shown)

  const columns: { heading: string; links: FooterLink[] }[] = [
    ...(m2
      ? []
      : [
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
        ]),
    {
      heading: t('footer.about'),
      links: [
        { label: t('sections.about'), href: paths.section('about') },
        { label: t('pages.sources.title'), href: CONTENT_PAGES.sources.path },
        { label: t('footer.contact'), href: paths.contact(locale) },
      ].filter(shown),
    },
    ...(legal.length > 0 ? [{ heading: t('footer.legal'), links: legal }] : []),
  ]

  const contact = { href: paths.contact(locale) }
  const email = (chunks: ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>

  return (
    <footer className="border-t border-line bg-surface-sunken">
      <nav
        aria-label={t('footer.sitemap')}
        className={`page-frame grid gap-8 py-12 sm:grid-cols-2 ${m2 ? '' : 'lg:grid-cols-4'}`}
      >
        {columns.map((column) => (
          <div key={column.heading}>
            <h2 className="text-body font-bold">{column.heading}</h2>
            <ul role="list" className="mt-3 grid gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} hrefLang={link.hrefLang}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="page-frame flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-line py-6 text-caption">
        {shown(contact) ? (
          <a href={contact.href}>{t('footer.contact')}</a>
        ) : (
          <p>{t.rich('home.writeToUs', { email })}</p>
        )}
        {SOCIAL_LINKS.length > 0 && (
          <ul role="list" aria-label={t('footer.follow')} className="flex gap-6">
            {SOCIAL_LINKS.map((link) => (
              <li key={link.key}>
                <a href={link.href} rel="me">
                  {t(`footer.social.${link.key}`)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  )
}
