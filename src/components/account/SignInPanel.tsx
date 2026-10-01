import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { sendSignInLink } from '@/app/(frontend)/en/sign-in/actions'
import { altchaKey } from '@/lib/forms/altcha'
import { initialFormState } from '@/lib/forms/public-form'
import { emptySignInValues } from '@/lib/forms/sign-in'
import { MEMBER_LEGAL_LINKS } from '@/lib/members/paths'
import { safeNext } from '@/lib/members/return-path'
import { anyMethod, memberRequest } from '@/lib/members/session'
import { PRIVACY_EMAIL } from '@/lib/site'

import { SignInForm } from './SignInForm'

// The ways to sign in (M4b, D49; the M4b design §5), on the sign-in page and in place of an
// account page for visitors who are signed out: the email form, the privacy line and the terms
// and age line. Only the ways that are switched on are offered; with none (production until the
// operator sets the keys), the panel says that signing in is not available yet. `next` is where
// sign-in leads afterwards, checked here and again when the link is used.

export async function SignInPanel({ next }: { next: string | null }) {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn' })
  const { origin, methods } = await memberRequest()
  const privacyEmail = (chunks: ReactNode) => <a href={`mailto:${PRIVACY_EMAIL}`}>{chunks}</a>

  if (!origin || !anyMethod(methods)) {
    return (
      <div className="grid gap-4">
        <p className="notice">{t('notAvailable')}</p>
        <p>{t.rich('notAvailableContact', { email: privacyEmail })}</p>
      </div>
    )
  }

  const key = altchaKey()
  const email =
    methods.email && key ? (
      <section aria-labelledby="sign-in-email-heading" className="grid gap-4">
        <h2 id="sign-in-email-heading" className="text-h3">
          {t('emailHeading')}
        </h2>
        {/* Without JavaScript the spam check cannot run; the server then says so too. */}
        <noscript>
          <p className="notice">{t('noscript')}</p>
        </noscript>
        <SignInForm
          action={sendSignInLink}
          initial={await initialFormState(
            emptySignInValues(next ? safeNext(next, origin) : null),
            key,
          )}
          text={{
            errorTitle: t('errors.title'),
            errorPrefix: t('errors.prefix'),
            email: { label: t('email.label'), hint: t('email.hint') },
            honeypot: t('honeypot'),
            spamNote: t.rich('spamNote', {
              link: (chunks) => <a href={MEMBER_LEGAL_LINKS.spamProtection}>{chunks}</a>,
            }),
            submit: t('submit'),
            sending: t('sending'),
          }}
        />
      </section>
    ) : null

  return (
    <div className="grid gap-8">
      {email}
      <div className="grid gap-3 text-text-muted">
        <p>
          {t.rich('privacy', {
            link: (chunks) => <a href={MEMBER_LEGAL_LINKS.privacy}>{chunks}</a>,
          })}
        </p>
        <p>
          {t.rich('terms', {
            link: (chunks) => <a href={MEMBER_LEGAL_LINKS.terms}>{chunks}</a>,
          })}
        </p>
      </div>
    </div>
  )
}
