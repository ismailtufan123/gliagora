// The M2 version of "Check your inbox" after the Glia Notes signup (src/lib/public-pages.ts, D50):
// the same page in the reduced header and footer. Rendered for each request like the page (its
// sealed cookie); Next.js reads `dynamic` only from the page's own file, never from a re-export.
export const dynamic = 'force-dynamic'

export { default, generateMetadata } from '@/app/(frontend)/en/newsletter/check-your-inbox/page'
