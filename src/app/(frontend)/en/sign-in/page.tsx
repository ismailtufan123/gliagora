import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { SignOutForm } from '@/components/account/AccountNav'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { SaveControl, type SaveJob, SaveRegion } from '@/components/account/SaveControl'
import { SignInPanel } from '@/components/account/SignInPanel'
import { SignedInAs } from '@/components/account/SignedInAs'
import { memberPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import { DEFAULT_NEXT, parseSave, safeNext, saveValue } from '@/lib/members/return-path'
import { saveContext } from '@/lib/members/save-context'
import { isSavable } from '@/lib/members/saved'
import { type CurrentMember, currentMember, memberRequest } from '@/lib/members/session'
import { jobForSaving, requestTime } from '@/lib/records'

// Sign in (M4b, D49; the M4b design §5): the ways to sign in that are on (SignInPanel), or, for a
// member who is signed in, who they are, with the way to their account and a Sign out button.
// `?next=` is where sign-in leads afterwards; `?error=` an outcome from the routes (an expired
// link, a Google or ORCID sign-in that was cancelled, took too long or was refused, a failure with
// its reference), shown in both cases: a member may sign in again while still signed in, to change
// accounts. `?save=job:{shortId}` comes from a Save link: the page names the position that signing
// in will save (only while it is public, so a crafted link cannot save anything unseen), and
// carries it through each way of signing in; a member who is signed in gets that position's Save
// button instead. Rendered for each request: it reads the session and gives the form its own
// spam-check challenge. Never indexed.
export const dynamic = 'force-dynamic'

/** The position `?save=` names, while it can be saved, or null. */
async function positionToSave(value: unknown): Promise<SaveJob | null> {
  const ref = parseSave(typeof value === 'string' ? value : null)
  if (!ref) return null
  const job = await jobForSaving(ref.shortId)
  if (!job?.title || !job.shortId || !isSavable(job, requestTime())) return null
  return {
    id: job.id,
    shortId: job.shortId,
    title: job.title,
    originalLanguage: job.originalLanguage ?? 'en',
  }
}

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
  let toSave: SaveJob | null
  try {
    current = await currentMember()
    toSave = await positionToSave(params.save)
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Sign-in page" error={error} />
  }
  const next = typeof params.next === 'string' ? params.next : null

  const outcome = readOutcome(params, {
    error: [
      'link-expired',
      'failed',
      'expired',
      'cancelled-google',
      'cancelled-orcid',
      'create-limited',
      'email-has-other-google',
    ],
  })
  if (current) {
    const account = await getTranslations({ locale: 'en', namespace: 'account' })
    // A Save link opened while signed in: that position's Save button, which returns to where
    // the link would have led.
    const { origin } = await memberRequest()
    const back = origin && next ? safeNext(next, origin) : DEFAULT_NEXT
    const save = toSave ? await saveContext(back, [toSave.id]) : null
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('signedIn.title')}</h1>
          <OutcomeMessage outcome={outcome} signedIn />
          <SignedInAs member={current.member} />
          {toSave && save && (
            <div className="grid justify-items-start gap-3">
              <p>
                {t.rich('signedIn.save', {
                  title: toSave.title,
                  strong: (chunks) => <strong className="wrap-anywhere">{chunks}</strong>,
                })}
              </p>
              <SaveControl job={toSave} context={save} />
              <SaveRegion context={save} />
            </div>
          )}
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

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <OutcomeMessage outcome={outcome} />
        <p className="text-card">{t('intro')}</p>
        {toSave && (
          <p>
            {t.rich('save', {
              title: toSave.title,
              strong: (chunks) => <strong className="wrap-anywhere">{chunks}</strong>,
            })}
          </p>
        )}
        <SignInPanel
          next={next}
          path={MEMBER_PATHS.signIn}
          save={toSave ? saveValue({ type: 'job', shortId: toSave.shortId }) : null}
        />
      </div>
    </main>
  )
}
