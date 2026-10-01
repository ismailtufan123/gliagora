import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { SignOutForm } from '@/components/account/AccountNav'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { SignInPanel } from '@/components/account/SignInPanel'
import { SignedInAs } from '@/components/account/SignedInAs'
import { memberPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { type CurrentMember, currentMember } from '@/lib/members/session'

// Sign in (M4b, D49; the M4b design §5): the ways to sign in that are on (SignInPanel), or, for a
// member who is signed in, who they are, with the way to their account and a Sign out button.
// `?next=` is where sign-in leads afterwards; `?error=` an outcome from the routes (an expired
// link, a failure with its reference). Rendered for each request: it reads the session and gives
// the form its own spam-check challenge. Never indexed.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn' })
  return {
    title: t('title'),
    description: t('description'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'signIn' })
  const params = await searchParams
  let current: CurrentMember | null
  try {
    current = await currentMember()
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Sign-in page" error={error} />
  }

  if (current) {
    const account = await getTranslations({ locale: 'en', namespace: 'account' })
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('signedIn.title')}</h1>
          <SignedInAs member={current.member} />
          <p>{t('signedIn.other')}</p>
          <div className="flex flex-wrap items-center gap-4">
            <a href={MEMBER_PATHS.account} className="button button-primary">
              {t('signedIn.account')}
            </a>
            <SignOutForm label={account('nav.signOut')} />
          </div>
        </div>
      </main>
    )
  }

  const next = typeof params.next === 'string' ? params.next : null
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <OutcomeMessage outcome={readOutcome(params, { error: ['link-expired', 'failed'] })} />
        <p className="text-card">{t('intro')}</p>
        <SignInPanel next={next} />
      </div>
    </main>
  )
}
