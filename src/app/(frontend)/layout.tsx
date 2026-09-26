import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { bodyFont, displayFont } from './fonts'
import './global.css'

export const metadata: Metadata = {
  title: {
    default: 'Gliagora | Neuroscience – Where neuroscience meets',
    template: '%s – Gliagora | Neuroscience',
  },
  description:
    'A curated, English-first hub for neuroscience positions, events, funding, papers, news and resources.',
  icons: {
    icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEF0F4' },
    { media: '(prefers-color-scheme: dark)', color: '#161942' },
  ],
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
        <footer className="site-footer">
          <div className="site-footer__inner">
            <a href="/en/contact/">Contact and legal notice</a>
          </div>
        </footer>
      </body>
    </html>
  )
}
