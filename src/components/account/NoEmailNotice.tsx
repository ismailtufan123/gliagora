import { getTranslations } from 'next-intl/server'

import { ACCOUNT_SECTIONS } from '@/lib/members/paths'
import { INACTIVITY_GRACE_DAYS, INACTIVITY_MONTHS } from '@/lib/retention/rules'

// The account page's notice for an account without an email address (the operator's addition to
// D49): it gets no warning before its deletion for inactivity (src/lib/retention/rules.ts), and
// adding an address lets us warn it and lets it join Glia Notes. With a link to the address form
// when the form is offered (a mail server and the spam check), else the same words without it.

export async function NoEmailNotice({ canAddEmail }: { canAddEmail: boolean }) {
  const t = await getTranslations('account')
  const period = { months: INACTIVITY_MONTHS, days: INACTIVITY_GRACE_DAYS }
  return (
    <p className="notice">
      {canAddEmail
        ? t.rich('noEmailNotice', {
            ...period,
            link: (chunks) => <a href={`#${ACCOUNT_SECTIONS.email}`}>{chunks}</a>,
          })
        : t('noEmailNoticeLater', period)}
    </p>
  )
}
