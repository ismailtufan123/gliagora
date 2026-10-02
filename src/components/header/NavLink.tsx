'use client'

import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'
import { useSyncExternalStore } from 'react'

import { LOCATION_CHANGE, linkState } from '@/lib/link-state'
import { publicPathname } from '@/lib/public-path'

// The query string is read after hydration: pages are static, so the server always renders
// them without one. It changes without a page load when the jobs list applies a filter
// (JobsListEnhancer sends LOCATION_CHANGE) and on Back and Forward.
const subscribe = (onChange: () => void) => {
  window.addEventListener(LOCATION_CHANGE, onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    window.removeEventListener(LOCATION_CHANGE, onChange)
    window.removeEventListener('popstate', onChange)
  }
}
const useSearch = () =>
  useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => '',
  )

// A plain link that marks itself as the current page (aria-current="page") or as the current
// section (data-section, for styling only); see src/lib/link-state.ts. The path is the one the
// visitor sees: an M2 version of a page (src/app/(frontend)/m2/) is rendered under its own path.
export function NavLink({ href, children, ...props }: ComponentProps<'a'> & { href: string }) {
  const state = linkState(publicPathname(usePathname()), useSearch(), href)
  return (
    <a
      href={href}
      aria-current={state === 'page' ? 'page' : undefined}
      data-section={state === 'section' ? '' : undefined}
      {...props}
    >
      {children}
    </a>
  )
}
