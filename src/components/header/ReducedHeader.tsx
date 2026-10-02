import { getTranslations } from 'next-intl/server'

import { Icon } from '@/components/Icon'
import { Lockup } from '@/components/Lockup'
import type { Locale } from '@/i18n/routing'
import { isPublicAddress } from '@/lib/public-pages'
import { TRANSLATIONS, paths } from '@/lib/site'

import { DisclosureEnhancer } from './DisclosureEnhancer'
import { localeLabels } from './locale-labels'
import { LocaleSwitcher } from './LocaleSwitcher'
import { NavLink } from './NavLink'

// The menu shows on phones, below the `md` breakpoint (768px), where the header has no room for
// the language and Glia Notes buttons. Keep this query in step with the `md:` classes below and
// with global.css (.site-header-m2).
const DESKTOP_QUERY = '(min-width: 48rem)'

// The header of the M2 state (D41 (4), D50; src/lib/site-stage.ts), on its public pages only, so
// it links to public pages only: the lockup (the coming-soon page), the language button where the
// page has a translation that is public too, and the Glia Notes button. On phones a menu holds
// About, the Glia Notes button and the languages. No windows, search or Account: they stay private
// until the launch (D39, D49). Its Turkish texts are reviewed first (PUBLIC_AT_M2 in
// src/scripts/tr-strings-review-areas.ts, D47).
export async function ReducedHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })
  const labels = await localeLabels(locale)
  // A translation is offered only while both of its pages are public: a link to the other one must
  // never ask for the password.
  const pairs = TRANSLATIONS.filter((pair) =>
    Object.values(pair).every((path) => isPublicAddress(path)),
  )

  return (
    <header className="site-header site-header-m2">
      <div className="page-frame flex h-full items-center gap-2 sm:gap-4">
        <Lockup
          size="header"
          href={paths.home()}
          name={t('brand.name')}
          descriptor={t('brand.descriptor')}
        />
        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <LocaleSwitcher
            className="hidden md:block"
            locale={locale}
            labels={labels}
            icons={{
              globe: <Icon name="globe" size={18} />,
              chevron: <Icon name="chevronDown" size={16} className="chevron" />,
            }}
            pairs={pairs}
            onlyWithTranslation
          />
          {/* A longer label wraps within 15rem, as in the full header. */}
          <a
            className="button button-primary hidden max-w-60 leading-tight md:inline-flex"
            href={paths.section('newsletter')}
          >
            {t('header.digest')}
          </a>
          {/* Like the full header's menu (MobileMenu.tsx), a disclosure that works without
              JavaScript; DisclosureEnhancer makes the page behind it inert while it is open. */}
          <details className="disclosure md:hidden" data-disclosure data-modal>
            <summary className="button button-secondary px-2.5 sm:px-3">
              <Icon name="menu" size={20} />
              <span className="sr-only sm:not-sr-only">{t('header.menu')}</span>
            </summary>
            <div className="mobile-panel">
              <NavLink href={paths.section('about')} className="mobile-row border-b border-line">
                {t('sections.about')}
              </NavLink>
              <a
                className="button button-primary mt-6 w-full justify-center"
                href={paths.section('newsletter')}
              >
                {t('header.digest')}
              </a>
              <LocaleSwitcher
                variant="list"
                className="mt-8"
                locale={locale}
                labels={labels}
                pairs={pairs}
                onlyWithTranslation
              />
            </div>
          </details>
        </div>
      </div>
      <DisclosureEnhancer desktopQuery={DESKTOP_QUERY} />
    </header>
  )
}
