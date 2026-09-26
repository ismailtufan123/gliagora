import localFont from 'next/font/local'

// Self-hosted WOFF2 files (PLAN §7.3); see tools/fonts/README.md for how they are built.
// next/font adds size-adjusted fallback fonts, so text does not shift when the fonts load.

export const displayFont = localFont({
  src: '../../fonts/commissioner-latin.woff2',
  weight: '600 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-display',
})

export const bodyFont = localFont({
  src: '../../fonts/atkinson-hyperlegible-next-latin.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-body',
})
