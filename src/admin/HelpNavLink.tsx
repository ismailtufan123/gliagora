'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'

import { HELP_PATH } from './help-path'

// "Yardım" (Help) at the end of the admin's side menu: the Turkish editor guide (src/admin/help.ts).
// Marked like Payload's own menu entries, with the bar beside it on the guide's page.

export function HelpNavLink() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const pathname = usePathname()
  const href = formatAdminURL({ adminRoute, path: HELP_PATH })
  const current = pathname.replace(/\/$/, '') === href.replace(/\/$/, '')
  return (
    <Link
      className="nav__link help-nav-link"
      href={href}
      id="nav-help"
      lang="tr"
      prefetch={false}
      aria-current={current ? 'page' : undefined}
    >
      {current && <div className="nav__link-indicator" />}
      <span className="nav__link-label">Yardım</span>
    </Link>
  )
}
