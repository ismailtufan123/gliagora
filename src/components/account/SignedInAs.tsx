import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import type { MemberRecord } from '@/lib/members/store'

// Who is signed in, as the sign-in and account pages say it: the account's email address, or
// else its ORCID iD, or else "your Google account" (an account that started with Google without an
// address Google manages has nothing else to show).

export async function SignedInAs({ member }: { member: MemberRecord }) {
  const t = await getTranslations({ locale: 'en', namespace: 'account.who' })
  // Addresses and iDs can be long, with no place to break: they may break anywhere.
  const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>
  const text = member.email
    ? t.rich('email', { email: member.email, strong })
    : member.orcidId
      ? t.rich('orcid', { orcid: member.orcidId, strong })
      : t('google')
  return <p>{text}</p>
}
