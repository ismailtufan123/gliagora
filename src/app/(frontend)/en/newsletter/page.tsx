import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { NewsletterForm } from '@/components/newsletter/NewsletterForm'
import { altchaKey } from '@/lib/forms/altcha'
import { emptyNewsletterValues } from '@/lib/forms/newsletter'
import { initialFormState } from '@/lib/forms/public-form'
import { newsletterSignupIndexed } from '@/lib/indexing'
import { appOrigin } from '@/lib/members/origin'
import { newsletterConfig } from '@/lib/newsletter/config'
import { NEWSLETTER_LEGAL_LINKS, NEWSLETTER_PATHS } from '@/lib/newsletter/paths'
import { CONTACT_EMAIL } from '@/lib/site'

import { sendNewsletterSignup } from './actions'

// The Glia Notes signup (M2, D50; PLAN §9.10, §13): an email address and the unticked consent box,
// with the minimum age and the privacy texts beside it. Double opt-in: the form only emails a
// confirmation link (src/app/(frontend)/en/newsletter/actions.ts); listmonk gets the address once
// its owner has confirmed. Rendered for each request, because each page gets its own spam-check
// challenge and the signup's settings are read when the page is (src/lib/newsletter/config.ts):
// without listmonk, a mail server, the spam check or a known origin, the page says the signup is
// unavailable and gives the address to write to. Indexed (`newsletterSignupIndexed()`).
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

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter' })
  const email = (chunks: ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>
  const key = appOrigin(await headers()) && newsletterConfig().signup.on ? altchaKey() : null

  let form: ReactNode
  if (key) {
    form = (
      <>
        {/* Without JavaScript the spam check cannot run; the server then says so too. */}
        <noscript>
          <p className="notice">{t.rich('noscript', { email })}</p>
        </noscript>
        <NewsletterForm
          action={sendNewsletterSignup}
          initial={await initialFormState(emptyNewsletterValues(), key)}
          text={{
            errorTitle: t('errors.title'),
            errorPrefix: t('errors.prefix'),
            email: { label: t('email.label'), hint: t('email.hint') },
            consent: {
              label: t('consent.label'),
              hint: t.rich('consent.hint', {
                consent: (chunks) => (
                  <a href={NEWSLETTER_LEGAL_LINKS.consent} hrefLang="tr">
                    {chunks}
                  </a>
                ),
                privacy: (chunks) => <a href={NEWSLETTER_LEGAL_LINKS.privacy}>{chunks}</a>,
                kvkk: (chunks) => (
                  <a href={NEWSLETTER_LEGAL_LINKS.kvkk} hrefLang="tr">
                    {chunks}
                  </a>
                ),
              }),
            },
            honeypot: t('honeypot'),
            spamNote: t.rich('spamNote', {
              link: (chunks) => <a href={NEWSLETTER_LEGAL_LINKS.spamProtection}>{chunks}</a>,
            }),
            submit: t('submit'),
            sending: t('sending'),
          }}
        />
      </>
    )
  } else {
    form = <p className="notice">{t.rich('unavailable', { email })}</p>
  }

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-card">{t('intro')}</p>
        <p>{t('firstIssue')}</p>
        <div className="mt-4">{form}</div>
      </div>
    </main>
  )
}
