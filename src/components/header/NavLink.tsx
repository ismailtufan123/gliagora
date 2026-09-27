'use client'

import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'
import { useSyncExternalStore } from 'react'

const withoutSlash = (path: string) => path.replace(/\/+$/, '')

// The query string is read after hydration: pages are static, so the server always renders
// them without one.
const noSubscription = () => () => {}
const useSearch = () =>
  useSyncExternalStore(
    noSubscription,
    () => window.location.search,
    () => '',
  )

// A plain link that marks itself as the current page (aria-current="page") when its path and
// query string both match the address, e.g. "PhD" on /en/jobs/?type=phd. A link to the same
// path with another query, or to a parent path, is marked as the current section
// (data-section, for styling only).
export function NavLink({ href, ...props }: ComponentProps<'a'> & { href: string }) {
  const pathname = withoutSlash(usePathname())
  const search = useSearch()
  const [path = '', query = ''] = href.split('?')
  const target = withoutSlash(path)
  const isPage = pathname === target && (query ? `?${query}` : '') === search
  const inSection = !isPage && !query && (pathname === target || pathname.startsWith(`${target}/`))
  return (
    <a
      href={href}
      aria-current={isPage ? 'page' : undefined}
      data-section={inSection ? '' : undefined}
      {...props}
    />
  )
}
