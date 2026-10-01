import config from '@payload-config'
import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPayload } from 'payload'
import { type ReactNode, cache } from 'react'

import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { pendingRequest } from '@/lib/data-requests/confirm'
import type { DataRequestKind } from '@/lib/data-requests/kinds'
import { DATA_REQUEST_PATHS } from '@/lib/data-requests/paths'
import { dataRequestPageIndexed } from '@/lib/indexing'
import { readOutcome } from '@/lib/members/outcome'
import { findEmailToken, memberDb } from '@/lib/members/store'
import { isToken } from '@/lib/members/tokens'
import { requestTime } from '@/lib/records'

// Where the data-request form's emailed link leads (M4b, D49; the M4b design §5, §7.8 step 4).
// Opening it only looks the link up: mail scanners and link previews may open it any number of
// times, and nothing is done until the person presses the button, which posts to
// /en/legal/data-requests/confirm/use/. The page names the address and the kind of request; for a
// deletion it lists what will be deleted and what stays. It shows nothing the person wrote. A link
// that is unknown, used or expired has its own message. After a failure (`?error=failed&ref=`) the
// message comes first and the button stays: nothing changed. Never indexed; the document's title
// is the heading of the state shown (WCAG 2.4.2).
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** The `token` of the address as one string, so the lookup's cache has one key per request. */
const tokenOf = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '')

type Landing =
  { state: 'expired' } | { state: 'ready'; token: string; email: string; kind: DataRequestKind }

const landing = cache(async (token: string): Promise<Landing> => {
  if (!isToken(token)) return { state: 'expired' }
  const db = memberDb(await getPayload({ config }))
  const link = await findEmailToken(db, token, requestTime())
  const pending = pendingRequest(link)
  // A sign-in link or a link to add an address has its own page.
  if (!link || !pending) return { state: 'expired' }
  return { state: 'ready', token, email: link.email, kind: pending.kind }
})

/** The page's heading, which is its title too. */
const titleOf = (found: Landing) =>
  found.state === 'expired'
    ? 'expiredTitle'
    : found.kind === 'deletion'
      ? 'deletionTitle'
      : 'otherTitle'

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.confirm' })
  let title: string
  try {
    title = t(titleOf(await landing(tokenOf((await searchParams).token))))
  } catch (error) {
    unstable_rethrow(error)
    // The page shows MemberUnavailable, under this heading, and logs the error.
    title = t('otherTitle')
  }
  return {
    title,
    ...(dataRequestPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.confirm' })
  const params = await searchParams
  let found: Landing
  try {
    found = await landing(tokenOf(params.token))
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('otherTitle')} name="Data request page" error={error} />
  }

  if (found.state === 'expired') {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t(titleOf(found))}</h1>
          <p>{t('expired')}</p>
          <p>{t('expiredUsed')}</p>
          <p>
            <a href={DATA_REQUEST_PATHS.form} className="button button-primary">
              {t('again')}
            </a>
          </p>
        </div>
      </main>
    )
  }

  // An address can be long, with no place to break: it may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>
  const deletion = found.kind === 'deletion'
  // The kind as the form names it.
  const kinds = await getTranslations({ locale: 'en', namespace: 'dataRequest.kind' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-8">
        <div className="grid gap-4">
          <h1 className="text-h1">{t(titleOf(found))}</h1>
          <OutcomeMessage
            outcome={readOutcome(params, { error: ['failed'] })}
            failed="requestFailed"
          />
          <p>{t.rich('from', { email: found.email, strong })}</p>
          {deletion ? (
            <p>{t('deletion.intro')}</p>
          ) : (
            <>
              <p>{t.rich('other.kind', { kind: kinds(`${found.kind}.label`), strong })}</p>
              <p>{t('other.answer')}</p>
            </>
          )}
        </div>

        {deletion && (
          <>
            <section aria-labelledby="deleted-heading" className="grid gap-4">
              <h2 id="deleted-heading" className="text-h2">
                {t('deletion.goneHeading')}
              </h2>
              <ul className="grid list-disc gap-2 ps-6">
                <li>{t('deletion.gone.suggestions')}</li>
                <li>{t('deletion.gone.account')}</li>
                <li>{t('deletion.gone.reports')}</li>
                <li>{t('deletion.gone.newsletter')}</li>
              </ul>
            </section>
            <section aria-labelledby="kept-heading" className="grid gap-4">
              <h2 id="kept-heading" className="text-h2">
                {t('deletion.keptHeading')}
              </h2>
              <ul className="grid list-disc gap-2 ps-6">
                <li>{t('deletion.kept.personalRights')}</li>
                <li>{t('deletion.kept.record')}</li>
                <li>{t('deletion.kept.backups')}</li>
              </ul>
            </section>
            <p>{t('deletion.email')}</p>
          </>
        )}

        <p>{t('notYou')}</p>
        <form method="post" action={DATA_REQUEST_PATHS.confirmUse}>
          <input type="hidden" name="token" value={found.token} />
          <button type="submit" className="button button-primary">
            {t(deletion ? 'deletion.button' : 'other.button')}
          </button>
        </form>
      </div>
    </main>
  )
}
