import config from '@payload-config'
import type { Metadata } from 'next'
import { unstable_rethrow } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPayload } from 'payload'

import { AccountNav } from '@/components/account/AccountNav'
import { MemberUnavailable } from '@/components/account/MemberUnavailable'
import { OutcomeMessage } from '@/components/account/OutcomeMessage'
import { SaveRegion } from '@/components/account/SaveControl'
import { SignInPanel } from '@/components/account/SignInPanel'
import { JobList } from '@/components/jobs/JobList'
import { Pagination } from '@/components/Pagination'
import { jobsHref } from '@/lib/filters/jobs'
import { memberPageIndexed } from '@/lib/indexing'
import { listingState } from '@/lib/jobs/deadline'
import type { JobCard } from '@/lib/jobs/view'
import { readOutcome } from '@/lib/members/outcome'
import { MEMBER_PATHS } from '@/lib/members/paths'
import type { SaveContext } from '@/lib/members/save-context'
import { type CurrentMember, currentMember } from '@/lib/members/session'
import { type SavedJobRow, listSavedJobs, memberDb } from '@/lib/members/store'
import { jobCardsByIds, requestTime } from '@/lib/records'

// Saved positions (M4b, D49; the M4b design §3, §5), 25 to a page: the open ones first, then
// those no longer open (closed, or withdrawn), each group with the last saved first. A position
// no longer open keeps its row, with its title as text (its page is closing, or gone) and a
// pressed Save that removes it. `?done=removed` and `?error=` are the outcomes of the Save route
// (src/lib/members/saved.ts): a removal without JavaScript, whose row is then gone, and a Save it
// refused (500 saved, or no longer public), which leads here. For visitors who are signed out, the
// sign-in panel (200, as the account page). Rendered for each request, never indexed.
export const dynamic = 'force-dynamic'

const SAVED_PER_PAGE = 25
const MAX_PAGE = 99_999

const SAVED_OUTCOMES = {
  done: ['removed'],
  error: ['saved-full', 'not-public', 'failed'],
} as const

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'saved' })
  return {
    title: t('title'),
    description: t('description'),
    ...(memberPageIndexed() ? {} : { robots: { index: false } }),
  }
}

/** The page number in `?page=`, or 1. */
function pageOf(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,4}$/.test(value)) return 1
  return Math.min(Number(value), MAX_PAGE)
}

/** The saved page's own address for page `n`. */
const savedHref = (n: number) => (n > 1 ? `${MEMBER_PATHS.saved}?page=${n}` : MEMBER_PATHS.saved)

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'saved' })
  const params = await searchParams
  const page = pageOf(params.page)
  const now = requestTime()
  let current: CurrentMember | null
  let rows: SavedJobRow[] = []
  try {
    current = await currentMember()
    if (current)
      rows = await listSavedJobs(memberDb(await getPayload({ config })), current.member.id)
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Saved page" error={error} />
  }

  if (!current) {
    return (
      <main id="main" className="page-frame flex-1 py-12">
        <div className="grid max-w-(--measure) gap-6">
          <h1 className="text-h1">{t('signedOutTitle')}</h1>
          <SignInPanel next={MEMBER_PATHS.saved} path={MEMBER_PATHS.saved} />
        </div>
      </main>
    )
  }

  // Open first, then the rest; each in the order they came (the last saved first).
  const isOpen = (row: SavedJobRow) => listingState(row, now) === 'open'
  const ordered = [...rows.filter(isOpen), ...rows.filter((row) => !isOpen(row))]
  const pages = Math.max(1, Math.ceil(ordered.length / SAVED_PER_PAGE))
  const shown = ordered.slice((page - 1) * SAVED_PER_PAGE, page * SAVED_PER_PAGE)
  let cards: JobCard[]
  try {
    cards = await jobCardsByIds(
      shown.map((row) => row.jobId),
      'en',
    )
  } catch (error) {
    unstable_rethrow(error)
    return <MemberUnavailable title={t('title')} name="Saved page" error={error} />
  }
  const openCards = cards.filter((card) => listingState(card, now) === 'open')
  const closedCards = cards.filter((card) => listingState(card, now) !== 'open')
  const save: SaveContext = {
    signedIn: true,
    saved: new Set(rows.map((row) => row.jobId)),
    back: savedHref(page),
  }
  const pastEnd = ordered.length > 0 && page > pages

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid gap-8">
        <div className="max-w-(--measure)">
          <AccountNav current="saved" />
        </div>
        <div className="grid max-w-(--measure) gap-4">
          <h1 className="text-h1">{t('title')}</h1>
          <OutcomeMessage outcome={readOutcome(params, SAVED_OUTCOMES)} />
          <SaveRegion context={save} />
          {ordered.length === 0 ? (
            <p>{t.rich('empty', { link: (chunks) => <a href={jobsHref()}>{chunks}</a> })}</p>
          ) : (
            <p>{t('intro', { count: ordered.length })}</p>
          )}
        </div>

        {openCards.length > 0 && (
          <section aria-labelledby="saved-open" className="grid max-w-(--measure) gap-4">
            <h2 id="saved-open" className="text-h2">
              {t('open')}
            </h2>
            <JobList jobs={openCards} now={now} locale="en" headingLevel={3} save={save} />
          </section>
        )}

        {closedCards.length > 0 && (
          <section aria-labelledby="saved-closed" className="grid max-w-(--measure) gap-4">
            <h2 id="saved-closed" className="text-h2">
              {t('closed')}
            </h2>
            <p>{t('closedText')}</p>
            <JobList
              jobs={closedCards}
              now={now}
              locale="en"
              headingLevel={3}
              compact
              plainTitle
              save={save}
            />
          </section>
        )}

        {pastEnd && (
          <p className="flex flex-wrap gap-x-2">
            <span>{t('pastEnd', { pages })}</span>
            <a href={savedHref(1)}>{t('firstPage')}</a>
          </p>
        )}

        <Pagination locale="en" page={page} pages={pages} href={savedHref} />
      </div>
    </main>
  )
}
