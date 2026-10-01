import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { AccountNav } from '@/components/account/AccountNav'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { SignInPanel } from '@/components/account/SignInPanel'
import { SignedInAs } from '@/components/account/SignedInAs'
import { CONTENT_PAGES } from '@/lib/content'
import { canSendEmail } from '@/lib/email/settings'
import { memberPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { type CurrentMember, currentMember } from '@/lib/members/session'

// "Delete your account?" (M4b, D49; the M4b design §5, §7.6, F13): a page of its own rather than a
// dialog, so it works without JavaScript and the header's disclosure script never meets it. It
// says what is deleted and what stays (the record of the request, the backups), and that one email
// confirms it when the account has an address and the site can send email (a mail server is set
// up: `canSendEmail()`, read for each request); the button posts to
// /en/account/privacy/delete/use/ (src/lib/members/account-deletion.ts), and Cancel leads back to
// the privacy page. `?error=failed` when the deletion could not be done: the message says that
// the account was not deleted, which is always true here, as it shows only to a member who is
// still signed in. In the account navigation, Privacy is marked as the section this page is in.
// For visitors who are signed out, the sign-in panel, which leads back here. Never indexed.
export const dynamic = 'force-dynamic'

const DELETE_OUTCOMES = { error: ['failed'] } as const

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'account.delete' })
  return {
    title: t('title'),
    description: t('description'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'account.delete' })
  const params = await searchParams
  let current: CurrentMember | null
  try {
    current = await currentMember()
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Account deletion page" error={error} />
  }

  if (!current) {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('signedOutTitle')}</h1>
          <SignInPanel next={MEMBER_PATHS.privacyDelete} path={MEMBER_PATHS.privacyDelete} />
        </div>
      </main>
    )
  }

  const { member } = current
  // An address can be long, with no place to break: it may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-8">
        <AccountNav current="privacy" section />
        <div className="grid gap-4">
          <h1 className="text-h1">{t('title')}</h1>
          <OutcomeMessage
            outcome={readOutcome(params, DELETE_OUTCOMES)}
            signedIn
            failed="deleteFailed"
          />
          <SignedInAs member={member} />
          <p>{t('intro')}</p>
        </div>

        <section aria-labelledby="deleted-heading" className="grid gap-4">
          <h2 id="deleted-heading" className="text-h2">
            {t('goneHeading')}
          </h2>
          <ul className="grid list-disc gap-2 ps-6">
            <li>{t('gone.account')}</li>
            <li>{t('gone.saved')}</li>
            <li>{t('gone.settings')}</li>
            <li>{t('gone.sessions')}</li>
          </ul>
        </section>

        <section aria-labelledby="kept-heading" className="grid gap-4">
          <h2 id="kept-heading" className="text-h2">
            {t('keptHeading')}
          </h2>
          <ul className="grid list-disc gap-2 ps-6">
            <li>{t('kept.record')}</li>
            <li>{t('kept.backups')}</li>
            <li>
              {t.rich('kept.other', {
                link: (chunks) => <a href={CONTENT_PAGES.dataRequests.path}>{chunks}</a>,
              })}
            </li>
          </ul>
        </section>

        {member.email && canSendEmail() && (
          <p>{t.rich('email', { email: member.email, strong })}</p>
        )}

        <form
          method="post"
          action={MEMBER_PATHS.privacyDeleteUse}
          className="flex flex-wrap items-center gap-4"
        >
          <button type="submit" className="button button-primary">
            {t('submit')}
          </button>
          <a href={MEMBER_PATHS.privacy} className="button button-secondary">
            {t('cancel')}
          </a>
        </form>
      </div>
    </main>
  )
}
