import { getTranslations } from 'next-intl/server'

import { CONTACT_EMAIL, SITE_ORIGIN, SOCIAL_LINKS } from '@/lib/site'

// Structured data (PLAN §16.2): Organization and WebSite on the home and About pages.

function JsonLd({ data }: { data: Record<string, unknown> }) {
  // "<" is escaped so the text can never close the script element.
  const json = JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(
    /</g,
    '\\u003c',
  )
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

export async function OrganizationJsonLd() {
  const t = await getTranslations({ locale: 'en', namespace: 'meta' })
  return (
    <JsonLd
      data={{
        '@type': 'Organization',
        name: t('siteName'),
        url: `${SITE_ORIGIN}/`,
        email: CONTACT_EMAIL,
        logo: `${SITE_ORIGIN}/brand/gliagora-mark.svg`,
        ...(SOCIAL_LINKS.length > 0 ? { sameAs: SOCIAL_LINKS.map((link) => link.href) } : {}),
      }}
    />
  )
}

export async function WebSiteJsonLd() {
  const t = await getTranslations({ locale: 'en', namespace: 'meta' })
  return (
    <JsonLd
      data={{
        '@type': 'WebSite',
        name: t('siteName'),
        url: `${SITE_ORIGIN}/en/`,
        inLanguage: 'en',
      }}
    />
  )
}
