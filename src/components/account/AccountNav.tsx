import { getTranslations } from 'next-intl/server'

import { MEMBER_PATHS } from '@/lib/members/paths'

// The account's own navigation (M4b, D49; the M4b design §2), at the top of every account page:
// the account pages and a Sign out button. The header's Account link is the same for everyone, so
// the account pages carry what PLAN's account menu would have held. The page it is on is marked
// (aria-current="page"). The account pages that come later (saved positions, privacy) join here.

export type AccountPage = 'overview'

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

export async function AccountNav({ current }: { current: AccountPage }) {
  const t = await getTranslations({ locale: 'en', namespace: 'account' })
  const pages: { key: AccountPage; href: string; label: string }[] = [
    { key: 'overview', href: MEMBER_PATHS.account, label: t('nav.overview') },
  ]
  return (
    <nav aria-label={t('navLabel')} className="border-b border-line pb-4">
      <ul role="list" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {pages.map((page) => (
          <li key={page.key}>
            <a
              href={page.href}
              aria-current={page.key === current ? 'page' : undefined}
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
