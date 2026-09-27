import { ChevronDown, Menu } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import type { WindowKey } from '@/lib/site'
import { paths } from '@/lib/site'

import { type LocaleLabels, LocaleSwitcher } from './LocaleSwitcher'
import { NavLink } from './NavLink'

export type MenuWindowLinks = {
  key: WindowKey
  label: string
  href: string
  menuLabel: string
  menu?: { label: string; href: string }[]
}

// In the mobile menu the window name opens its sub-sections, so the window page itself is listed
// first unless the menu already starts with it ("All positions").
function withWindowLink({ label, href, menu = [] }: MenuWindowLinks) {
  return menu[0]?.href === href ? menu : [{ label, href }, ...menu]
}

// PLAN §2.3, §7.5: below the `xl` breakpoint, a full-height panel with the six windows
// (expandable), the map, Learn, the digest button and, on small screens, the languages.
// DisclosureEnhancer makes the page behind it inert while it is open.
export async function MobileMenu({
  locale,
  windows,
  localeLabels,
}: {
  locale: Locale
  windows: MenuWindowLinks[]
  localeLabels: LocaleLabels
}) {
  const t = await getTranslations({ locale })
  return (
    <details className="disclosure xl:hidden" data-disclosure data-modal>
      <summary className="button button-secondary px-2.5 sm:px-3">
        <Menu aria-hidden="true" size={20} />
        <span className="sr-only sm:not-sr-only">{t('header.menu')}</span>
      </summary>
      <div className="mobile-panel">
        <nav aria-label={t('header.navLabel')}>
          <ul role="list" className="grid">
            {windows.map((window) => (
              <li key={window.key} className="border-b border-line">
                {window.menu ? (
                  <details className="disclosure" data-disclosure>
                    <summary className="mobile-row">
                      {window.label}
                      <ChevronDown aria-hidden="true" size={20} className="chevron" />
                    </summary>
                    <ul role="list" className="grid pb-3 ps-4">
                      {withWindowLink(window).map((item) => (
                        <li key={item.href}>
                          <NavLink href={item.href} className="menu-item">
                            {item.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <NavLink href={window.href} className="mobile-row">
                    {window.label}
                  </NavLink>
                )}
              </li>
            ))}
            {(['map', 'learn'] as const).map((key) => (
              <li key={key} className="border-b border-line">
                <NavLink href={paths.section(key)} className="mobile-row">
                  {t(`sections.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <a
          className="button button-primary mt-6 w-full justify-center"
          href={paths.section('newsletter')}
        >
          {t('header.digest')}
        </a>
        <LocaleSwitcher
          variant="list"
          className="mt-8 md:hidden"
          locale={locale}
          labels={localeLabels}
        />
      </div>
    </details>
  )
}
