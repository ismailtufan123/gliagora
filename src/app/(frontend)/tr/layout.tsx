import type { ReactNode } from 'react'

import { LocaleRoot, localeMetadata, localeViewport } from '@/components/LocaleRoot'

export const generateMetadata = () => localeMetadata('tr')
export const viewport = localeViewport

export default function Layout({ children }: { children: ReactNode }) {
  return <LocaleRoot locale="tr">{children}</LocaleRoot>
}
