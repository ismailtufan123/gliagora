import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'

// The M2 version of the Glia Notes signup (src/lib/public-pages.ts, D50), public once the açık
// rıza metni is approved: the same form, with the same Server Action, which the form posts to the
// page's address; its links to the privacy texts lead only to public pages (src/lib/m2-links.ts).
// Rendered for each request, like the page; Next.js reads `dynamic` only from the page's own file,
// never from a re-export.
export const dynamic = 'force-dynamic'

export { generateMetadata } from '@/app/(frontend)/en/newsletter/page'

export default function Page() {
  return <NewsletterSignup stage="m2" />
}
