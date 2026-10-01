import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { memberPageIndexed } from '@/lib/indexing'
import { SIGN_IN_COOKIE } from '@/lib/members/cookies'
import { MEMBER_LEGAL_LINKS, MEMBER_PATHS } from '@/lib/members/paths'
import { openSignIn } from '@/lib/members/seal'
import { memberRequest } from '@/lib/members/session'
import { requestTime } from '@/lib/records'

// "Create your Gliagora account" (M4b, D49; the M4b design §5, §7.2 step 5): after signing in with
// Google or ORCID with an identity no account has, nothing is made until the person presses
// "Create account" here, having read the terms and age line. The identity waits in the sealed
// sign-in cookie (15 minutes, this browser only); the page shows what the account will have: the
// Google address, if Google manages it (otherwise a note that it is not added), or the ORCID iD,
// with an unticked box to take the record's name as display name. For an account without an
// address, a hint for people who already have an account. The button posts to
// /en/sign-in/create/; Cancel leads back to the sign-in page (the cookie then expires). Rendered
// for each request, never indexed.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.confirm' })
  return {
    title: t('metaTitle'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page() {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.confirm' })
  const pending = openSignIn(
    (await cookies()).get(SIGN_IN_COOKIE)?.value,
    process.env.PAYLOAD_SECRET ?? '',
    requestTime(),
    'confirm',
  )
  const { methods } = await memberRequest()

  if (!pending || !methods[pending.p]) {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('expiredTitle')}</h1>
          <p>{t('expired')}</p>
          <p>
            <a href={MEMBER_PATHS.signIn} className="button button-primary">
              {t('again')}
            </a>
          </p>
        </div>
      </main>
    )
  }

  // Addresses and iDs can be long, with no place to break: they may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>
  const signInLink = (chunks: ReactNode) => <a href={MEMBER_PATHS.signIn}>{chunks}</a>
  const what =
    pending.p === 'google'
      ? pending.email
        ? t.rich('googleWithEmail', { email: pending.email, strong })
        : t('googleWithoutEmail')
      : t.rich('orcid', { orcid: pending.sub, strong })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <p>{what}</p>
        {pending.ignoredEmail && (
          <p className="notice wrap-anywhere" role="note">
            {t(pending.ignoredReason === 'unverified' ? 'googleUnverified' : 'googleNotManaged', {
              email: pending.ignoredEmail,
            })}
          </p>
        )}
        {!pending.email && <p>{t.rich('existing', { method: pending.p, link: signInLink })}</p>}
        <form method="post" action={MEMBER_PATHS.signInCreate} className="grid gap-6">
          {pending.p === 'orcid' && pending.name && (
            <div className="field">
              <div className="choice">
                <input
                  id="use-name"
                  name="use-name"
                  type="checkbox"
                  value="yes"
                  aria-describedby="use-name-hint"
                />
                <label htmlFor="use-name" className="wrap-anywhere">
                  {t('useName', { name: pending.name })}
                </label>
              </div>
              <p id="use-name-hint" className="field-hint choice-hint">
                {t('useNameHint')}
              </p>
            </div>
          )}
          <p>
            {t.rich('terms', {
              link: (chunks) => <a href={MEMBER_LEGAL_LINKS.terms}>{chunks}</a>,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className="button button-primary">
              {t('button')}
            </button>
            <a href={MEMBER_PATHS.signIn} className="button button-secondary">
              {t('cancel')}
            </a>
          </div>
        </form>
      </div>
    </main>
  )
}
