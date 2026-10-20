import { Icon } from '@/components/Icon'
import { getTranslations } from 'next-intl/server'

import { Lockup } from '@/components/Lockup'
import type { Locale } from '@/i18n/routing'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { MEGA_MENUS, NAV_PAGES, hasMenu } from '@/lib/navigation'
import { LIVE_WINDOWS, paths } from '@/lib/site'

import { DisclosureEnhancer } from './DisclosureEnhancer'
import { localeLabels } from './locale-labels'
import { LocaleSwitcher } from './LocaleSwitcher'
import { MobileMenu, type MenuWindowLinks } from './MobileMenu'
import { NavLink } from './NavLink'
import { SearchDialog } from './SearchDialog'

// The desktop navigation shows from the `xl` breakpoint (1280px); below it, the mobile menu. The
// six windows, language and digest button need about 1200px in Turkish. Keep this query in step
// with the `xl:` classes below and in MobileMenu.
const DESKTOP_QUERY = '(min-width: 80rem)'

// PLAN §2.3, §7.5: lockup, the windows that are built (D55: Jobs until M8; a window with a
// mega-menu opens it from a separate button, and the label itself is a real link), the map, the
// subfields and About, then search, language, the account and the digest button. The M2 state's
// public pages have the reduced header instead (ReducedHeader.tsx, D41).
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })

  const windows: MenuWindowLinks[] = LIVE_WINDOWS.map((key) => ({
    key,
    label: t(`windows.${key}`),
    href: paths.window(key),
    menuLabel: t('header.menuFor', { window: t(`windows.${key}`) }),
    menu: hasMenu(key)
      ? MEGA_MENUS[key].map((item) => ({
          label: t(`menus.${key}.${item.key}` as `menus.jobs.all`),
          href: item.href,
        }))
      : undefined,
  }))

  const pages = NAV_PAGES.map(({ key, href }) => ({
    key,
    href,
    label: key === 'subfields' ? t('subfields.title') : t(`sections.${key}`),
  }))

  const labels = await localeLabels(locale)

  return (
    <header className="site-header">
      <div className="page-frame flex h-full items-center gap-2 sm:gap-4">
        {/* Where longer labels or larger text need more room, the lockup gives way: it drops its
            descriptor, then its name (global.css). The navigation and the buttons keep their
            size. */}
        <Lockup
          size="header"
          href={paths.home()}
          name={t('brand.name')}
          descriptor={t('brand.descriptor')}
        />

        <nav aria-label={t('header.navLabel')} className="hidden xl:block">
          <ul role="list" className="flex items-center">
            {windows.map((window) => (
              <li key={window.key} className="relative flex items-center">
                <NavLink href={window.href} className="nav-link">
                  {window.label}
                </NavLink>
                {window.menu && (
                  <details className="disclosure" data-disclosure>
                    <summary className="disclosure-button size-7" aria-label={window.menuLabel}>
                      <Icon name="chevronDown" size={16} className="chevron" />
                    </summary>
                    <div className="menu-panel start-0 w-max max-w-[36rem]">
                      <ul
                        role="list"
                        className={`grid gap-x-6 gap-y-1 ${window.menu.length > 6 ? 'grid-cols-2' : ''}`}
                      >
                        {window.menu.map((item) => (
                          <li key={item.href}>
                            <NavLink href={item.href} className="menu-item">
                              {item.label}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}
              </li>
            ))}
            {pages.map((page) => (
              <li key={page.key} className="flex items-center">
                <NavLink href={page.href} className="nav-link">
                  {page.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2 xl:gap-1">
          {/* A link to the search page, which JavaScript turns into the search dialog's button
              (DisclosureEnhancer). The search icon with its name for screen readers (PLAN §7.4);
              in the desktop layout also the shortcut, on screens with a keyboard, once JavaScript
              runs (global.css). The word "Search" does not fit beside the Turkish labels. Below
              360px the lockup leaves room for the menu button only, so search moves into the menu. */}
          <a
            href={paths.search()}
            hrefLang={locale === 'en' ? undefined : 'en'}
            className="button button-secondary search-trigger whitespace-nowrap max-[22.5rem]:hidden"
            data-search-open
          >
            <Icon name="search" size={18} />
            <span className="sr-only">{t('search.trigger')}</span>
            <span className="search-hint" aria-hidden="true">
              <kbd data-key="ctrl">{t('search.shortcutCtrl')}</kbd>
              <kbd data-key="apple">{t('search.shortcutApple')}</kbd>
            </span>
          </a>
          <LocaleSwitcher
            className="hidden md:block"
            locale={locale}
            labels={labels}
            icons={{
              globe: <Icon name="globe" size={18} />,
              chevron: <Icon name="chevronDown" size={16} className="chevron" />,
            }}
          />
          {/* The account (M4b, D49): the same static link for everyone, signed in or not, so pages
              stay static and the header needs no cookie or script; the account page shows the
              sign-in panel to visitors who are signed out. An icon with its name for screen
              readers, like search (an icon-only exception to PLAN §7.4): a word would not fit
              beside the full lockup at 1280px. Below 1280px it is a row in the mobile menu. */}
          <NavLink
            href={MEMBER_PATHS.account}
            hrefLang={locale === 'en' ? undefined : 'en'}
            className="button button-secondary account-link hidden xl:inline-flex"
          >
            <Icon name="user" size={18} />
            <span className="sr-only">{t('header.account')}</span>
          </NavLink>
          {/* A longer label wraps within 15rem: two lines for one 40% longer than the English. */}
          <a
            className="button button-primary hidden max-w-60 leading-tight md:inline-flex"
            href={paths.section('newsletter')}
          >
            {t('header.digest')}
          </a>
          <MobileMenu locale={locale} windows={windows} localeLabels={labels} />
        </div>
      </div>
      <SearchDialog locale={locale} />
      <DisclosureEnhancer desktopQuery={DESKTOP_QUERY} />
    </header>
  )
}
