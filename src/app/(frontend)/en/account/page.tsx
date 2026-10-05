import config from '@payload-config'
import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPayload } from 'payload'

import { AccountNav } from '@/components/account/AccountNav'
import {
  DigestSettings,
  DisplayNameSettings,
  EmailSettings,
  SubfieldSettings,
} from '@/components/account/AccountSettings'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { NoEmailNotice } from '@/components/account/NoEmailNotice'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { SignInPanel } from '@/components/account/SignInPanel'
import { SignedInAs } from '@/components/account/SignedInAs'
import { altchaKey } from '@/lib/forms/altcha'
import { memberPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { MEMBER_PATHS, providerStartPath } from '@/lib/members/paths'
import { type CurrentMember, currentMember, memberRequest } from '@/lib/members/session'
import { memberDb, preferredSubfields } from '@/lib/members/store'
import { activeSubfields } from '@/lib/records'

// The account (M4b, D49; the M4b design §2, §5, §7.4): who is signed in (with a notice for an
// account without an email address, which gets no warning before its deletion for inactivity: the
// operator's addition to D49); Glia Notes; the preferred subfields, the jobs list's default filter
// (D35); the email address, added or changed through an emailed link; the ways to sign in (Google
// and ORCID can be linked, through their start routes with `link=1`, and removed, unless one is the
// last way in); and the display name. Downloading the data, signing out everywhere and deleting the
// account are on the privacy page (/en/account/privacy/). For a visitor who is signed out, the same
// address shows the sign-in panel (200, not a redirect: the header links here, and every header
// link must lead to a page). `?done=` and
// `?error=` are the outcomes of the routes and links that lead here (OutcomeMessage). Rendered for
// each request, never indexed.
export const dynamic = 'force-dynamic'

/**
 * The outcomes of the routes that lead here: signing in, linking and removing a method, the
 * settings, and the link that adds an address.
 */
const ACCOUNT_OUTCOMES = {
  done: [
    'signed-in',
    'signed-in-linked-google',
    'created',
    'linked-google',
    'linked-orcid',
    'unlinked-google',
    'unlinked-orcid',
    'email-verified',
    'digest-on',
    'digest-off',
    'subfields-saved',
    'subfields-removed',
    'name-saved',
    'name-removed',
  ],
  error: [
    'failed',
    'cancelled-google',
    'cancelled-orcid',
    'expired',
    'link-interrupted',
    'link-not-started',
    'google-elsewhere',
    'orcid-elsewhere',
    'google-already-linked',
    'orcid-already-linked',
    'last-method',
    'email-taken',
    'verify-expired',
    'digest-consent',
    'digest-needs-email',
    'subfields-too-many',
    'name-invalid',
  ],
} as const

/**
 * What a link flow can end in when this browser was signed out meanwhile (in another browser,
 * "Sign out everywhere"): the person still pressed Continue, Deny, or answered an older tab.
 */
const SIGNED_OUT_OUTCOMES = {
  error: ['failed', 'cancelled-google', 'cancelled-orcid', 'expired', 'link-interrupted'],
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
  let subfields: { slug: string; label: string }[] = []
  let chosen: string[] = []
  try {
    current = await currentMember()
    if (current) {
      const db = memberDb(await getPayload({ config }))
      const [all, preferred] = await Promise.all([
        activeSubfields('en'),
        preferredSubfields(db, current.member.id),
      ])
      subfields = all.map((term) => ({ slug: term.slug, label: term.label || term.slug }))
      chosen = preferred.map((subfield) => subfield.slug)
    }
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Account page" error={error} />
  }

  if (!current) {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('signedOutTitle')}</h1>
          <OutcomeMessage outcome={readOutcome(params, SIGNED_OUT_OUTCOMES)} />
          <SignInPanel next={MEMBER_PATHS.account} path={MEMBER_PATHS.account} />
        </div>
      </main>
    )
  }

  const { member } = current
  const { methods } = await memberRequest()
  // The form that adds or changes the address needs a mail server and the spam check.
  const spamKey = altchaKey()
  const canAddEmail = methods.email && spamKey !== null
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
          {/* Without an address there is no warning before the deletion for inactivity. */}
          {member.email === null && <NoEmailNotice canAddEmail={canAddEmail} />}
        </div>

        <DigestSettings member={member} canAddEmail={canAddEmail} />
        <SubfieldSettings subfields={subfields} chosen={chosen} />
        <EmailSettings member={member} available={methods.email} altchaKey={spamKey} />

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
            <p className="text-text-muted">
              {t('methods.note', {
                methods:
                  methods.google && methods.orcid ? 'both' : methods.google ? 'google' : 'orcid',
              })}
            </p>
          )}
        </section>

        <DisplayNameSettings member={member} />
      </div>
    </main>
  )
}
