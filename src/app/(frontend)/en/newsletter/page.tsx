import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NewsletterSignup } from '@/components/newsletter/NewsletterSignup'
import { newsletterSignupIndexed } from '@/lib/indexing'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'

// The Glia Notes signup (M2, D50; PLAN §9.10, §13), its content in NewsletterSignup, which its M2
// version shares. Double opt-in: the form only emails a confirmation link
// (src/app/(frontend)/en/newsletter/actions.ts); listmonk gets the address once its owner has
// confirmed. Rendered for each request, because each page gets its own spam-check challenge and the
// signup's settings are read when the page is (src/lib/newsletter/config.ts). Indexed
// (`newsletterSignupIndexed()`).
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter' })
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: NEWSLETTER_PATHS.signup },
    ...(newsletterSignupIndexed() ? {} : { robots: { index: false } }),
  }
}

export default function Page() {
  return <NewsletterSignup />
}
