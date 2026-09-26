import localFont from 'next/font/local'

// Self-hosted WOFF2 files (PLAN §7.3); see tools/fonts/README.md for how they are built.
// next/font adds size-adjusted fallback fonts, so text does not shift when the fonts load.
// The global 404 page imports them too, and Next.js adds that page to every route; so the admin
// also receives the font preload headers (about 70 KB, admin only). Turbopack merges the CSS of
// the public pages into one chunk, so a separate copy without preloading does not avoid this.

export const displayFont = localFont({
  src: '../../fonts/commissioner-latin.woff2',
  weight: '600 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-commissioner',
})

export const bodyFont = localFont({
  src: '../../fonts/atkinson-hyperlegible-next-latin.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-atkinson',
})

export const fontVariables = `${displayFont.variable} ${bodyFont.variable}`
