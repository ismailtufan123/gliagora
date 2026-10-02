// The M2 version of the page the Glia Notes confirmation link opens (src/lib/public-pages.ts, D50):
// the same page in the reduced header and footer; its button posts to the route behind it, which
// is public too. Rendered for each request like the page; Next.js reads `dynamic` only from the
// page's own file, never from a re-export.
export const dynamic = 'force-dynamic'

export { default, generateMetadata } from '@/app/(frontend)/en/newsletter/confirm/page'
