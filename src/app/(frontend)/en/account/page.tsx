import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AccountNav, SignOutForm } from '@/components/account/AccountNav'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { SignInPanel } from '@/components/account/SignInPanel'
import { SignedInAs } from '@/components/account/SignedInAs'
import { memberPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { MEMBER_PATHS, providerStartPath } from '@/lib/members/paths'
import { type CurrentMember, currentMember, memberRequest } from '@/lib/members/session'

// The account (M4b, D49; the M4b design §2, §5): who is signed in, the ways to sign in (Google and
// ORCID can be linked, through their start routes with `link=1`, and removed, unless one is the
// last way in), and signing out everywhere. For a visitor who is signed out, the same address
// shows the sign-in panel (200, not a redirect: the header links here, and every header link must
// lead to a page). `?done=` and `?error=` are the outcomes of the routes that lead here
// (OutcomeMessage). Rendered for each request, never indexed.
export const dynamic = 'force-dynamic'

/** The outcomes of the routes that lead here: signing in, linking and removing a method. */
const ACCOUNT_OUTCOMES = {
  done: [
    'signed-in',
    'created',
    'linked-google',
    'linked-orcid',
    'unlinked-google',
    'unlinked-orcid',
  ],
  error: [
    'failed',
    'cancelled',
    'expired',
    'link-interrupted',
    'google-elsewhere',
    'orcid-elsewhere',
    'google-already-linked',
    'orcid-already-linked',
    'last-method',
  ],
} as const

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'account' })
  return {
    title: t('title'),
    description: t('description'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'account' })
  const params = await searchParams
  let current: CurrentMember | null
  try {
    current = await currentMember()
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Account page" error={error} />
  }

  if (!current) {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('signedOutTitle')}</h1>
          <OutcomeMessage
            outcome={readOutcome(params, { error: ['failed', 'link-interrupted'] })}
          />
          <SignInPanel next={MEMBER_PATHS.account} path={MEMBER_PATHS.account} />
        </div>
      </main>
    )
  }

  const { member } = current
  const { methods } = await memberRequest()
  // How many ways into the account there are: the last one cannot be removed.
  const ways = [member.email, member.googleId, member.orcidId].filter(Boolean).length
  const provider = (key: 'google' | 'orcid', linked: string | null) => ({
    key,
    label: t(`methods.${key}`),
    value:
      linked === null ? t('methods.notLinked') : key === 'orcid' ? linked : t('methods.linked'),
    shown: linked !== null || methods[key],
    action:
      linked === null ? (
        // A link, not a form: the start route redirects to the provider (CSP `form-action 'self'`).
        <a href={`${providerStartPath(key)}?link=1`} className="button button-secondary">
          {t(`methods.link.${key}`)}
        </a>
      ) : ways > 1 ? (
        <form method="post" action={MEMBER_PATHS.accountSettings}>
          <input type="hidden" name="intent" value={`unlink-${key}`} />
          <button type="submit" className="button button-secondary">
            {t(`methods.unlink.${key}`)}
          </button>
        </form>
      ) : (
        <span className="text-text-muted">{t('methods.onlyWay')}</span>
      ),
  })
  // The ways in this account has, and those it could add once they are offered.
  const rows = [
    {
      key: 'email',
      label: t('methods.email'),
      value: member.email ?? t('methods.noEmail'),
      shown: member.email !== null || methods.email,
      action: null,
    },
    provider('google', member.googleId),
    provider('orcid', member.orcidId),
  ].filter((row) => row.shown)

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-8">
        <AccountNav current="overview" />
        <div className="grid gap-4">
          <h1 className="text-h1">{t('title')}</h1>
          <OutcomeMessage outcome={readOutcome(params, ACCOUNT_OUTCOMES)} />
          <SignedInAs member={member} />
          {member.displayName && (
            <p>
              {t.rich('displayName', {
                name: member.displayName,
                strong: (chunks) => <strong className="wrap-anywhere">{chunks}</strong>,
              })}
            </p>
          )}
        </div>

        <section aria-labelledby="methods-heading" className="grid gap-4">
          <h2 id="methods-heading" className="text-h2">
            {t('methods.heading')}
          </h2>
          <dl className="grid gap-3">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid justify-items-start gap-1 border-b border-line pb-3"
              >
                <dt className="font-bold">{row.label}</dt>
                <dd className="wrap-anywhere">{row.value}</dd>
                {row.action && <dd className="mt-2">{row.action}</dd>}
              </div>
            ))}
          </dl>
          {(methods.google || methods.orcid) && (
            <p className="text-text-muted">{t('methods.note')}</p>
          )}
        </section>

        <section aria-labelledby="sign-out-heading" className="grid justify-items-start gap-4">
          <h2 id="sign-out-heading" className="text-h2">
            {t('signOut.heading')}
          </h2>
          <p>{t('signOut.text')}</p>
          <SignOutForm label={t('signOut.everywhere')} scope="everywhere" />
        </section>
      </div>
    </main>
  )
}
