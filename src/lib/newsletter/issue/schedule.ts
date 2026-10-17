import { addDays } from '@/lib/jobs/deadline'

// When an issue of Glia Notes goes out (D16; PLAN §13): monthly, on the first Tuesday at 13:00 UTC
// (morning in the Americas, afternoon in Europe and Türkiye, evening in East Asia). An issue is
// named by the month of its date (`2026-11`), which is also its archive address
// (`/en/newsletter/2026-11/`): one issue a month. The launch issue (D41) may go out on another day;
// its month is still the month of its date.

/** The hour of the day (UTC) an issue goes out. */
export const SEND_HOUR_UTC = 13

/** Deadlines in this many days after an issue's date are listed in it (PLAN §13). */
export const DEADLINE_WINDOW_DAYS = 45

/** An issue's month, `YYYY-MM`. */
export const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** The first Tuesday of a month (UTC), at the hour issues go out. */
function firstTuesday(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month, 1, SEND_HOUR_UTC))
  // getUTCDay: Sunday 0, Tuesday 2.
  const offset = (2 - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, month, 1 + offset, SEND_HOUR_UTC))
}

/** The next first Tuesday at 13:00 UTC after `now`: the default date of a new issue. */
export function nextIssueDate(now: Date): Date {
  const thisMonth = firstTuesday(now.getUTCFullYear(), now.getUTCMonth())
  return thisMonth.getTime() > now.getTime()
    ? thisMonth
    : firstTuesday(now.getUTCFullYear(), now.getUTCMonth() + 1)
}

/** The month (`YYYY-MM`, UTC) of an issue's date. */
export function issueMonth(sendAt: Date): string {
  return sendAt.toISOString().slice(0, 7)
}

/** The calendar day (`YYYY-MM-DD`, UTC) of an issue's date. */
export const issueDay = (sendAt: Date) => sendAt.toISOString().slice(0, 10)

/** The days whose deadlines an issue lists: its own day to 45 days later, both included. */
export function deadlineWindow(sendAt: Date): { from: string; to: string } {
  const from = issueDay(sendAt)
  return { from, to: addDays(from, DEADLINE_WINDOW_DAYS) }
}

/** A month written out for people: `2026-11` → "November 2026". */
export function monthName(month: string): string {
  const match = MONTH_PATTERN.exec(month)
  if (!match) return month
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
