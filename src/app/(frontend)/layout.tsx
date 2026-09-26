import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Gliagora | Neuroscience – Where neuroscience meets',
  description:
    'A curated, English-first hub for neuroscience positions, events, funding and papers.',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
