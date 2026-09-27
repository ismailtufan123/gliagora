'use client'

import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'

const withoutSlash = (path: string) => path.replace(/\/+$/, '')

// A plain link that marks the page it leads to as current (aria-current="page"), or as the
// section the current page is in (data-section, for styling only). Links with a query string
// (filtered lists) are never current.
export function NavLink({ href, ...props }: ComponentProps<'a'> & { href: string }) {
  const pathname = withoutSlash(usePathname())
  const target = withoutSlash(href)
  const isPage = !href.includes('?') && pathname === target
  const inSection = !isPage && !href.includes('?') && pathname.startsWith(`${target}/`)
  return (
    <a
      href={href}
      aria-current={isPage ? 'page' : undefined}
      data-section={inSection ? '' : undefined}
      {...props}
    />
  )
}
