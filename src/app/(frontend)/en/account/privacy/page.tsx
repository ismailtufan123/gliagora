import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { AccountNav, SignOutForm } from '@/components/account/AccountNav'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { SignInPanel } from '@/components/account/SignInPanel'
import { SignedInAs } from '@/components/account/SignedInAs'
import { CONTENT_PAGES } from '@/lib/content'
import { memberPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { type CurrentMember, currentMember } from '@/lib/members/session'

// Privacy and your data (M4b, D49; the M4b design §5, §7.5, §7.6): "Download my data" (a link to
// the export route, which answers a JSON file), "Sign out everywhere" (a form to the sign-out
// route) and "Delete my account" (a link to the confirmation page, which says what goes and what
// stays: no dialog, so it works without JavaScript and needs nothing from the header's script).
// `?error=failed` is the export's outcome when it could not be made. For visitors who are signed
// out, the sign-in panel (200, as the account page), with `?done=not-signed-in` when "Delete my
// account" was pressed without a session (a second press after the deletion). Rendered for each
// request, never indexed.
export const dynamic = 'force-dynamic'

const PRIVACY_OUTCOMES = { error: ['failed'] } as const

/** "Delete my account" pressed with no session (src/lib/members/account-deletion.ts). */
const SIGNED_OUT_OUTCOMES = { done: ['not-signed-in'] } as const

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'account.privacy' })
  return {
    title: t('title'),
    description: t('description'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

/** A section of the page, with its heading. */
function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="grid justify-items-start gap-4">
      <h2 id={`${id}-heading`} className="text-h3">
        {heading}
      </h2>
      {children}
    </section>
  )
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'account.privacy' })
  const params = await searchParams
  let current: CurrentMember | null
  try {
    current = await currentMember()
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Privacy page" error={error} />
  }

  if (!current) {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('signedOutTitle')}</h1>
          <OutcomeMessage outcome={readOutcome(params, SIGNED_OUT_OUTCOMES)} />
          <SignInPanel next={MEMBER_PATHS.privacy} path={MEMBER_PATHS.privacy} />
        </div>
      </main>
    )
  }

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-8">
        <AccountNav current="privacy" />
        <div className="grid gap-4">
          <h1 className="text-h1">{t('title')}</h1>
          <OutcomeMessage outcome={readOutcome(params, PRIVACY_OUTCOMES)} signedIn />
          <SignedInAs member={current.member} />
        </div>

        <Section id="download" heading={t('download.heading')}>
          <p>{t('download.text')}</p>
          {/* A plain link: the route answers the file as a download (Content-Disposition). */}
          <a href={MEMBER_PATHS.privacyExport} className="button button-secondary">
            {t('download.link')}
          </a>
          <p className="text-text-muted">{t('download.format')}</p>
        </Section>

        <Section id="sign-out" heading={t('signOut.heading')}>
          <p>{t('signOut.text')}</p>
          <SignOutForm label={t('signOut.everywhere')} scope="everywhere" />
        </Section>

        <Section id="delete" heading={t('delete.heading')}>
          <p>{t('delete.text')}</p>
          <a href={MEMBER_PATHS.privacyDelete} className="button button-secondary">
            {t('delete.link')}
          </a>
        </Section>

        <p>
          {t.rich('more', {
            privacy: (chunks) => <a href={CONTENT_PAGES.privacy.path}>{chunks}</a>,
            requests: (chunks) => <a href={CONTENT_PAGES.dataRequests.path}>{chunks}</a>,
          })}
        </p>
      </div>
    </main>
  )
}
