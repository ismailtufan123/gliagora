import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/routing'
import { type DeadlineView, type DaysLeft, formatDay } from '@/lib/jobs/format'

import { DeadlineGauge } from './DeadlineGauge'

type Props = {
  view: DeadlineView
  locale: Locale
  /** On the job page: the date on its own line, the time zone below, and no gauge. */
  detail?: boolean
}

// A listing's deadline in words (PLAN §3.2): the date, the days left (or "Closed"), the "Closing
// soon" badge within 14 days, and "Rolling deadline" or "Open until filled" for open-ended ones.
// The words come from the `jobs` messages; the numbers from src/lib/jobs/format.ts.
export async function DeadlineText({ view, locale, detail = false }: Props) {
  const t = await getTranslations({ locale, namespace: 'jobs' })
  const leftText = (left: DaysLeft) =>
    left.key === 'daysLeft' ? t('daysLeft', { days: left.days }) : t(left.key)

  if (view.kind !== 'fixed') {
    return (
      <span className="deadline">
        <span>{t(view.kind === 'rolling' ? 'rolling' : 'untilFilled')}</span>
        {!view.open && (
          <>
            <span className="sr-only">,</span>
            <span>{t('closed')}</span>
          </>
        )}
      </span>
    )
  }

  const date = formatDay(view.day, locale)
  // A position that closed before its day (filled or withdrawn) shows "Closed" alone in lists.
  const day = detail || !view.closedEarly
  return (
    <span className="deadline">
      {day && (
        <span className={detail ? 'basis-full font-bold' : undefined}>
          {detail || !view.open ? date : t('closes', { date })}
        </span>
      )}
      {!detail && view.open && <DeadlineGauge filled={view.gauge} soon={view.closingSoon} />}
      {day && <span className="sr-only">,</span>}
      <span>{leftText(view.left)}</span>
      {view.closingSoon && (
        <>
          <span className="sr-only">,</span>
          <span className="badge">{t('closingSoon')}</span>
        </>
      )}
    </span>
  )
}
