'use client'

import { usePathname } from 'next/navigation'
import type { ComponentProps } from 'react'
import { useSyncExternalStore } from 'react'

import { linkState } from '@/lib/link-state'

// The query string is read after hydration: pages are static, so the server always renders
// them without one.
const noSubscription = () => () => {}
const useSearch = () =>
  useSyncExternalStore(
    noSubscription,
    () => window.location.search,
    () => '',
  )

// A plain link that marks itself as the current page (aria-current="page") or as the current
// section (data-section, for styling only); see src/lib/link-state.ts.
export function NavLink({ href, children, ...props }: ComponentProps<'a'> & { href: string }) {
  const state = linkState(usePathname(), useSearch(), href)
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
