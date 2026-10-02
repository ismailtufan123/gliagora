import { headers } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { NewsletterForm } from '@/components/newsletter/NewsletterForm'
import { altchaKey } from '@/lib/forms/altcha'
import { emptyNewsletterValues } from '@/lib/forms/newsletter'
import { initialFormState } from '@/lib/forms/public-form'
import { linkInStage } from '@/lib/m2-links'
import { appOrigin } from '@/lib/members/origin'
import { newsletterConfig } from '@/lib/newsletter/config'
import { NEWSLETTER_LEGAL_LINKS } from '@/lib/newsletter/paths'
import type { SiteStage } from '@/lib/site-stage'
import { CONTACT_EMAIL } from '@/lib/site'

import { sendNewsletterSignup } from '@/app/(frontend)/en/newsletter/actions'

// The Glia Notes signup page's content (M2, D50; PLAN §9.10, §13), shared by the page
// (src/app/(frontend)/en/newsletter/page.tsx) and its M2 version: an email address and the unticked
// consent box, with the minimum age and the privacy texts beside it. Read for each request: each
// page gets its own spam-check challenge, and the signup's settings are read now
// (src/lib/newsletter/config.ts): without listmonk, a mail server, the spam check or a known
// origin, it says the signup is not open yet. In the M2 version (`stage="m2"`) its links to the
// privacy policy and the KVKK notice keep only their words while those texts are not public
// (src/lib/m2-links.ts); the açık rıza metni is public whenever the signup is (src/lib/public-pages.ts).
export async function NewsletterSignup({ stage = 'private' }: { stage?: SiteStage }) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'newsletter' })
  const email = (chunks: ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>
  const legal = (href: string, hrefLang?: string) => {
    const to = linkInStage(href, stage)
    return function LegalLink(chunks: ReactNode) {
      return to === null ? (
        chunks
      ) : (
        <a href={to} hrefLang={hrefLang}>
          {chunks}
        </a>
      )
    }
  }
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
                consent: legal(NEWSLETTER_LEGAL_LINKS.consent, 'tr'),
                privacy: legal(NEWSLETTER_LEGAL_LINKS.privacy),
                kvkk: legal(NEWSLETTER_LEGAL_LINKS.kvkk, 'tr'),
              }),
            },
            honeypot: t('honeypot'),
            spamNote: t.rich('spamNote', { link: legal(NEWSLETTER_LEGAL_LINKS.spamProtection) }),
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
