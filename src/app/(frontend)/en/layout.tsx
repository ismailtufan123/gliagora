import type { ReactNode } from 'react'

import { LocaleRoot } from '@/components/LocaleRoot'
import { localeMetadata, localeViewport } from '@/lib/metadata'

export const generateMetadata = () => localeMetadata('en')
export const viewport = localeViewport

export default function Layout({ children }: { children: ReactNode }) {
  return <LocaleRoot locale="en">{children}</LocaleRoot>
}
