import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import { type ReactNode, cache } from 'react'

import { SignOutForm } from '@/components/account/AccountNav'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { SaveNotice } from '@/components/account/SaveControl'
import { SignInPanel } from '@/components/account/SignInPanel'
import { memberPageIndexed } from '@/lib/indexing'
import { SIGN_IN_COOKIE } from '@/lib/members/cookies'
import { MEMBER_LEGAL_LINKS, MEMBER_PATHS } from '@/lib/members/paths'
import { type SaveJob, positionToSave } from '@/lib/members/save-context'
import { openSignIn } from '@/lib/members/seal'
import { currentMember } from '@/lib/members/session'
import { type EmailTokenRecord, findEmailToken, findMember, memberDb } from '@/lib/members/store'
import { bindingMatches, isToken } from '@/lib/members/tokens'
import { requestTime } from '@/lib/records'

// Where an emailed sign-in link leads (M4b, D49; the M4b design §5, §7.1). Opening it only looks
// the link up: mail scanners and link previews may open it any number of times, and nothing is
// used or changed until the person presses the button, which posts to /en/sign-in/link/use/. The
// page says which address the link is for, and whether pressing it signs in or creates the
// account (with the terms and age line), and which position it will save, if the link carries one
// (a Save link's). When this browser does not hold the binding the link was made with (the sealed
// sign-in cookie of the browser that asked), it warns first: someone may have sent a link they
// asked for, to sign the reader in to their account. The button stays, since opening an email on
// another device is common.
//
// A link that adds an address to an account (the M4b design §7.4) opens here too: only the member
// who asked for it, signed in in this browser, sees the address and "Add this address"; anyone
// else is told to sign in to that account and open the link again (it works for 24 hours), and
// the link stays usable. Never indexed. The document's title is the heading of the state shown
// (WCAG 2.4.2): the link is looked up once per request, for the page and its metadata.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** The `token` of the address as one string, so the lookup's cache has one key per request. */
const tokenOf = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '')

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.link' })
  let title: string
  try {
    title = t(titleOf(await landing(tokenOf((await searchParams).token))))
  } catch (error) {
    unstable_rethrow(error)
    // The page shows MemberUnavailable, under this heading, and logs the error.
    title = t('signInTitle')
  }
  return {
    title,
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

type Landing =
  | { state: 'expired' }
  /** A link to add an address, opened by the member who asked for it. */
  | { state: 'verify'; token: string; email: string; current: string | null }
  /** A link to add an address, opened by anyone else: signed out, or as another member. */
  | { state: 'verify-other'; signedIn: boolean }
  | {
      state: 'ready'
      token: string
      email: string
      known: boolean
      sameBrowser: boolean
      toSave: SaveJob | null
    }

/** The page's heading, which is its title too. */
function titleOf(found: Landing) {
  switch (found.state) {
    case 'expired':
      return 'expiredTitle'
    case 'verify':
      return 'verifyTitle'
    case 'verify-other':
      return 'verifyOtherTitle'
    case 'ready':
      return found.known ? 'signInTitle' : 'createTitle'
  }
}

const landing = cache(async (token: string): Promise<Landing> => {
  if (!isToken(token)) return { state: 'expired' }
  const now = requestTime()
  const db = memberDb(await getPayload({ config }))
  const link: EmailTokenRecord | null = await findEmailToken(db, token, now)
  if (link?.purpose === 'verify-email') {
    const current = await currentMember()
    if (!current || current.member.id !== link.memberId) {
      return { state: 'verify-other', signedIn: current !== null }
    }
    return { state: 'verify', token, email: link.email, current: current.member.email }
  }
  // Links to confirm a data request have a page of their own.
  if (!link || link.purpose !== 'sign-in') return { state: 'expired' }
  const known = (await findMember(db, { email: link.email })) !== null
  const binding = openSignIn(
    (await cookies()).get(SIGN_IN_COOKIE)?.value,
    process.env.PAYLOAD_SECRET ?? '',
    now,
    'email',
  )
  return {
    state: 'ready',
    token,
    email: link.email,
    known,
    sameBrowser: binding !== null && bindingMatches(binding.bind, link.browserHash),
    toSave: await positionToSave(link.save),
  }
})

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.link' })
  let found: Landing
  try {
    found = await landing(tokenOf((await searchParams).token))
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('signInTitle')} name="Sign-in link page" error={error} />
  }

  if (found.state === 'expired') {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t(titleOf(found))}</h1>
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

  // An address can be long, with no place to break: it may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>

  if (found.state === 'verify') {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t(titleOf(found))}</h1>
          <p>{t.rich('verify', { email: found.email, strong })}</p>
          {found.current && <p>{t.rich('verifyReplaces', { email: found.current, strong })}</p>}
          <p>{t('verifyOthers')}</p>
          <form method="post" action={MEMBER_PATHS.signInLinkUse}>
            <input type="hidden" name="token" value={found.token} />
            <button type="submit" className="button button-primary">
              {t('verifyButton')}
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (found.state === 'verify-other') {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t(titleOf(found))}</h1>
          <p>{t('verifyOther')}</p>
          {found.signedIn ? (
            <>
              <p>{t('verifyOtherSignedIn')}</p>
              <SignOutForm label={t('signOut')} />
            </>
          ) : (
            // Sent without JavaScript, its form goes to the sign-in page (this address has a token).
            <SignInPanel next={null} path={MEMBER_PATHS.signIn} />
          )}
        </div>
      </main>
    )
  }

  const { email, known, sameBrowser, token, toSave } = found
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t(titleOf(found))}</h1>
        {!sameBrowser && (
          <p className="notice wrap-anywhere" role="note">
            {t('otherBrowser', { email })}
          </p>
        )}
        <p>{t.rich(known ? 'signIn' : 'create', { email, strong })}</p>
        {toSave && <SaveNotice job={toSave} />}
        {!known && (
          <p>
            {t.rich('terms', {
              link: (chunks) => <a href={MEMBER_LEGAL_LINKS.terms}>{chunks}</a>,
            })}
          </p>
        )}
        <form method="post" action={MEMBER_PATHS.signInLinkUse}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="button button-primary">
            {t(known ? 'signInButton' : 'createButton')}
          </button>
        </form>
      </div>
    </main>
  )
}
