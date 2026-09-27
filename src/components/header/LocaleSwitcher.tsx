'use client'

import { ChevronDown, Globe } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { type Locale, locales } from '@/i18n/routing'
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

// PLAN §2.3, §7.5: shows the current language, links to the same page in the other languages
// where a reviewed translation exists (TRANSLATIONS in src/lib/site.ts), and says that more
// languages are coming. Language names are written in their own language, with `lang`.
// `variant="list"` shows the same choices as a plain list, for the mobile menu.
export function LocaleSwitcher({
  locale,
  labels,
  variant = 'menu',
  className = '',
}: {
  locale: Locale
  labels: LocaleLabels
  variant?: 'menu' | 'list'
  className?: string
}) {
  const pathname = usePathname()
  const translations = translationsOf(pathname.endsWith('/') ? pathname : `${pathname}/`)
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
        <Globe aria-hidden="true" size={18} />
        <span>{labels.short[locale]}</span>
        <ChevronDown aria-hidden="true" size={16} className="chevron" />
      </summary>
      <div className="menu-panel end-0 w-56">{choices}</div>
    </details>
  )
}
