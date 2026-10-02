import type { ReactNode } from 'react'

import { LocaleRoot } from '@/components/LocaleRoot'
import { localeMetadata, localeViewport } from '@/lib/metadata'

// Root layout of the M2 versions of the public Turkish pages (src/lib/public-pages.ts, D50): the
// reduced header and footer, which link only to public pages (D41 (4)). The proxy shows these
// pages in place of the public ones when the site's stage is `m2` (src/proxy.ts).
export const generateMetadata = () => localeMetadata('tr')
export const viewport = localeViewport

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <LocaleRoot locale="tr" stage="m2">
      {children}
    </LocaleRoot>
  )
}
