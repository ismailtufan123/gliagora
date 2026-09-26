import type { ReactNode } from 'react'

import { LocaleRoot } from '@/components/LocaleRoot'
import { localeMetadata, localeViewport } from '@/lib/metadata'

export const generateMetadata = () => localeMetadata('tr')
export const viewport = localeViewport

export default function Layout({ children }: { children: ReactNode }) {
  return <LocaleRoot locale="tr">{children}</LocaleRoot>
}
