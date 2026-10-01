import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import type { ReactNode } from 'react'

import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { SaveNotice } from '@/components/account/SaveControl'
import { memberPageIndexed } from '@/lib/indexing'
import { SIGN_IN_COOKIE } from '@/lib/members/cookies'
import { MEMBER_LEGAL_LINKS, MEMBER_PATHS } from '@/lib/members/paths'
import { type SaveJob, positionToSave } from '@/lib/members/save-context'
import { openSignIn } from '@/lib/members/seal'
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
// another device is common. Never indexed.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn' })
  return {
    title: t('title'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

type Landing =
  | { state: 'expired' }
  | {
      state: 'ready'
      token: string
      email: string
      known: boolean
      sameBrowser: boolean
      toSave: SaveJob | null
    }

async function landing(token: unknown): Promise<Landing> {
  if (!isToken(token)) return { state: 'expired' }
  const now = requestTime()
  const db = memberDb(await getPayload({ config }))
  const link: EmailTokenRecord | null = await findEmailToken(db, token, now)
  // Links to add an address or to confirm a data request have pages of their own.
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
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'signIn.link' })
  let found: Landing
  try {
    found = await landing((await searchParams).token)
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('signInTitle')} name="Sign-in link page" error={error} />
  }

  if (found.state === 'expired') {
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

  const { email, known, sameBrowser, token, toSave } = found
  // An address can be long, with no place to break: it may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t(known ? 'signInTitle' : 'createTitle')}</h1>
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
