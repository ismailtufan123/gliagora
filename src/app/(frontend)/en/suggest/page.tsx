import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { SuggestForm } from '@/components/suggest/SuggestForm'
import { altchaKey } from '@/lib/forms/altcha'
import { initialFormState } from '@/lib/forms/public-form'
import { EMPTY_VALUES, SUGGEST_LEGAL_LINKS } from '@/lib/forms/suggest'
import { SUBMISSION_KINDS } from '@/lib/review/status'
import { CONTACT_EMAIL, paths } from '@/lib/site'

import { sendSuggestion } from './actions'

// "Suggest a listing" (PLAN §3.2, §9.10): a link to a posting on the employer's own page, what it
// is, an optional note and, only with consent, an email address for the outcome. Rendered for
// each request, because each page gets its own spam-check challenge; indexed (PLAN §2.2).
export const dynamic = 'force-dynamic'

const PATH = paths.section('suggest')

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'suggest' })
  return { title: t('title'), description: t('description'), alternates: { canonical: PATH } }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'suggest' })
  const email = (chunks: ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>
  const key = altchaKey()

  let form: ReactNode
  if (key) {
    const initial = await initialFormState(EMPTY_VALUES, key)
    form = (
      <>
        {/* Without JavaScript the spam check cannot run; the server then says so too. */}
        <noscript>
          <p className="notice">{t.rich('noscript', { email })}</p>
        </noscript>
        <SuggestForm
          action={sendSuggestion}
          initial={initial}
          text={{
            errorTitle: t('errors.title'),
            errorPrefix: t('errors.prefix'),
            url: { label: t('url.label'), hint: t('url.hint') },
            kind: {
              legend: t('kind.legend'),
              options: SUBMISSION_KINDS.map(({ value }) => ({
                value,
                label: t(`kind.${value}`),
              })),
            },
            note: {
              label: t('note.label'),
              hint: t('note.hint'),
              // Filled in by the form as the person types ("{count}" only, no plural forms).
              left: t.raw('note.left') as string,
              over: t.raw('note.over') as string,
            },
            email: { label: t('email.label'), hint: t('email.hint') },
            consent: {
              label: t('consent.label'),
              hint: t.rich('consent.hint', {
                privacy: (chunks) => <a href={SUGGEST_LEGAL_LINKS.privacy}>{chunks}</a>,
                kvkk: (chunks) => (
                  <a href={SUGGEST_LEGAL_LINKS.kvkk} hrefLang="tr">
                    {chunks}
                  </a>
                ),
              }),
            },
            honeypot: t('honeypot'),
            spamNote: t.rich('spamNote', {
              link: (chunks) => <a href={SUGGEST_LEGAL_LINKS.spamProtection}>{chunks}</a>,
            }),
            submit: t('submit'),
            sending: t('sending'),
          }}
        />
      </>
    )
  } else {
    // ALTCHA_HMAC_KEY is missing: say so instead of showing a form that cannot be sent.
    form = <p className="notice">{t.rich('unavailable', { email })}</p>
  }

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-card">{t('intro')}</p>
        <p>{t('employers')}</p>
        <p>{t('otherKinds')}</p>
        <div className="mt-4">{form}</div>
      </div>
    </main>
  )
}
