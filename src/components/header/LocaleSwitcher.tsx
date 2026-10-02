'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { type Locale, locales } from '@/i18n/routing'
import { publicPathname } from '@/lib/public-path'
import { translationsOf } from '@/lib/site'

export type LocaleLabels = {
  /** Heading of the language list in the mobile menu. */
  heading: string
  /** Accessible name of the button, e.g. "Language: English (EN)"; it contains the visible code. */
  button: string
  moreComing: string
  names: Record<Locale, string>
  short: Record<Locale, string>
}

/** The menu's globe and chevron, drawn by the server (SiteHeader). */
export type LocaleIcons = { globe: ReactNode; chevron: ReactNode }

// PLAN §2.3, §7.5: shows the current language, links to the same page in the other languages
// where a reviewed translation exists (TRANSLATIONS in src/lib/site.ts), and says that more
// languages are coming. Language names are written in their own language, with `lang`.
// `variant="list"` shows the same choices as a plain list, for the mobile menu.
// The M2 state's reduced header (D41, D50) gives the translations whose pages are all public
// (`pairs`) and shows the switcher only on a page that has one (`onlyWithTranslation`).
// A client component because the links follow the address (usePathname). Its icons come from the
// server as props (src/components/Icon.tsx), so they add nothing to its client code (PLAN §17.3).
export function LocaleSwitcher({
  locale,
  labels,
  icons,
  variant = 'menu',
  className = '',
  pairs,
  onlyWithTranslation = false,
}: {
  locale: Locale
  labels: LocaleLabels
  icons?: LocaleIcons
  variant?: 'menu' | 'list'
  className?: string
  pairs?: readonly Partial<Record<Locale, string>>[]
  onlyWithTranslation?: boolean
}) {
  // The address the visitor sees, also while the server renders an M2 version under /m2/.
  const pathname = publicPathname(usePathname())
  const translations = translationsOf(pathname.endsWith('/') ? pathname : `${pathname}/`, pairs)
  if (onlyWithTranslation && !locales.some((other) => other !== locale && translations[other])) {
    return null
  }
  const choices = (
    <>
      <ul role="list" className="grid gap-1">
        {locales.map((other) => {
          if (other === locale) {
            return (
              <li key={other}>
                <span className="menu-item" aria-current="true" lang={other}>
                  {labels.names[other]}
                </span>
              </li>
            )
          }
          const href = translations[other]
          if (!href) return null
          return (
            <li key={other}>
              <a className="menu-item" href={href} hrefLang={other} lang={other}>
                {labels.names[other]}
              </a>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 border-t border-line px-3 pt-2 text-caption text-text-muted">
        {labels.moreComing}
      </p>
    </>
  )

  if (variant === 'list') {
    return (
      <section aria-label={labels.heading} className={className}>
        <h2 className="text-body font-bold">{labels.heading}</h2>
        <div className="mt-2">{choices}</div>
      </section>
    )
  }

  return (
    <details className={`disclosure relative ${className}`} data-disclosure>
      <summary className="disclosure-button gap-1 px-2" aria-label={labels.button}>
        {icons?.globe}
        <span>{labels.short[locale]}</span>
        {icons?.chevron}
      </summary>
      <div className="menu-panel end-0 w-56">{choices}</div>
    </details>
  )
}
