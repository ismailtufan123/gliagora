import { ChevronDown } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import { Lockup } from '@/components/Lockup'
import type { Locale } from '@/i18n/routing'
import { MEGA_MENUS, hasMenu } from '@/lib/navigation'
import { WINDOWS, paths } from '@/lib/site'

import { DisclosureEnhancer } from './DisclosureEnhancer'
import { type LocaleLabels, LocaleSwitcher } from './LocaleSwitcher'
import { MobileMenu, type MenuWindowLinks } from './MobileMenu'
import { NavLink } from './NavLink'

// The desktop navigation shows from the `xl` breakpoint (1280px); below it, the mobile menu. The
// six windows, language and digest button need about 1200px in Turkish. Keep this query in step
// with the `xl:` classes below and in MobileMenu.
const DESKTOP_QUERY = '(min-width: 80rem)'

// PLAN §2.3, §7.5: lockup, the six windows (Jobs, Events and Resources open a mega-menu from a
// separate button; the label itself is a real link), language, and the digest button.
// Search (M4) and Sign in (M4b) are added with their features.
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })

  const windows: MenuWindowLinks[] = WINDOWS.map((key) => ({
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

  const localeLabels: LocaleLabels = {
    heading: t('locale.heading'),
    button: t('locale.button', {
      name: t(`locale.names.${locale}`),
      code: t(`locale.short.${locale}`),
    }),
    moreComing: t('locale.moreComing'),
    names: { en: t('locale.names.en'), tr: t('locale.names.tr') },
    short: { en: t('locale.short.en'), tr: t('locale.short.tr') },
  }

  return (
    <header className="site-header">
      <div className="page-frame flex h-full items-center gap-4">
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
                      <ChevronDown aria-hidden="true" size={16} className="chevron" />
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
          </ul>
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <LocaleSwitcher className="hidden md:block" locale={locale} labels={localeLabels} />
          <a
            className="button button-primary hidden max-w-60 text-center leading-tight whitespace-normal md:inline-flex"
            href={paths.section('newsletter')}
          >
            {t('header.digest')}
          </a>
          <MobileMenu locale={locale} windows={windows} localeLabels={localeLabels} />
        </div>
      </div>
      <DisclosureEnhancer desktopQuery={DESKTOP_QUERY} />
    </header>
  )
}
