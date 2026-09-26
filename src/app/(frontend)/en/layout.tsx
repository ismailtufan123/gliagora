import type { ReactNode } from 'react'

import { LocaleRoot, localeMetadata, localeViewport } from '@/components/LocaleRoot'

export const generateMetadata = () => localeMetadata('en')
export const viewport = localeViewport

export default function Layout({ children }: { children: ReactNode }) {
  return <LocaleRoot locale="en">{children}</LocaleRoot>
}
