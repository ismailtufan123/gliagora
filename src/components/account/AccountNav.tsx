import { getTranslations } from 'next-intl/server'

import { MEMBER_PATHS } from '@/lib/members/paths'
import { savedCount } from '@/lib/members/save-context'

// The account's own navigation (M4b, D49; the M4b design §2), at the top of every account page:
// the account pages and a Sign out button. The header's Account link is the same for everyone, so
// the account pages carry what PLAN's account menu would have held. The page it is on is marked
// (aria-current="page"); on a page inside an account page (`section`: the deletion confirmation,
// inside Privacy) that page's link is marked as the current section instead (`data-section`,
// styled the same), as NavLink does (src/lib/link-state.ts): it leads elsewhere, so it is not the
// current page. Saved positions show how many there are ("Saved (3)"). Privacy holds the download
// of the member's data, signing out everywhere and deleting the account.

export type AccountPage = 'overview' | 'saved' | 'privacy'

/** Signs this browser out (`scope=this`) or every browser of the account (`everywhere`). */
export function SignOutForm({
  label,
  scope = 'this',
  className = 'button button-secondary',
}: {
  label: string
  scope?: 'this' | 'everywhere'
  className?: string
}) {
  return (
    <form method="post" action={MEMBER_PATHS.signOut}>
      <input type="hidden" name="scope" value={scope} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  )
}

export async function AccountNav({
  current,
  section = false,
}: {
  current: AccountPage
  /** The page is inside `current` rather than `current` itself. */
  section?: boolean
}) {
  const t = await getTranslations({ locale: 'en', namespace: 'account' })
  const saved = await savedCount()
  const pages: { key: AccountPage; href: string; label: string }[] = [
    { key: 'overview', href: MEMBER_PATHS.account, label: t('nav.overview') },
    {
      key: 'saved',
      href: MEMBER_PATHS.saved,
      label: saved === null ? t('nav.saved') : t('nav.savedCount', { count: saved }),
    },
    { key: 'privacy', href: MEMBER_PATHS.privacy, label: t('nav.privacy') },
  ]
  return (
    <nav aria-label={t('navLabel')} className="border-b border-line pb-4">
      <ul role="list" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {pages.map((page) => (
          <li key={page.key}>
            <a
              href={page.href}
              aria-current={page.key === current && !section ? 'page' : undefined}
              data-section={page.key === current && section ? '' : undefined}
              className="nav-link"
            >
              {page.label}
            </a>
          </li>
        ))}
        <li className="ms-auto">
          <SignOutForm label={t('nav.signOut')} />
        </li>
      </ul>
    </nav>
  )
}
