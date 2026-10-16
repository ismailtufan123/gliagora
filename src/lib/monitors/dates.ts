import { fold } from '@/lib/tags/match'

// Reading a posting's deadline (D52: "many lists keep closed posts, so the deadline counts"):
// from its JSON-LD `validThrough`, else from its text, where a date follows a word for the deadline
// ("Closing date", "Bewerbungsfrist", "date limite", "sista ansökningsdag", "締切"), in the
// languages of the first sources. The editor checks it on the posting before publishing (§6.3).

export type FoundDeadline = {
  /** The calendar day, YYYY-MM-DD. */
  date: string
  /** The IANA zone the posting names, when it names one that is clear. */
  timeZone: string | null
  /** Where it was found, quoted briefly. */
  from: string
}

const MONTHS: Record<string, number> = {}
const addMonths = (names: string) =>
  names.split(' ').forEach((name, index) => {
    for (const variant of name.split('/')) MONTHS[variant] = (index % 12) + 1
  })
// English, German, French, Spanish, Italian, Dutch, Swedish/Danish/Norwegian, Portuguese.
addMonths(
  'january/jan february/feb march/mar april/apr may june/jun july/jul august/aug september/sep/sept october/oct november/nov december/dec',
)
addMonths(
  'januar februar marz/maerz april mai juni juli august september oktober november dezember',
)
addMonths('janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre')
addMonths(
  'enero febrero marzo abril mayo junio julio agosto septiembre/setiembre octubre noviembre diciembre',
)
addMonths(
  'gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre',
)
addMonths('januari februari maart april mei juni juli augustus september oktober november december')
addMonths('januari februari mars april maj juni juli augusti september oktober november december')
addMonths(
  'januar februar marts april maj juni juli august september oktober november desember/december',
)
addMonths(
  'janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro',
)
addMonths('ocak subat mart nisan mayis haziran temmuz agustos eylul ekim kasim aralik')

const MONTH = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|')

/** Words that introduce a deadline, folded (lower case, no accents; ø has none to drop). */
const LABELS = [
  'closing date',
  'close date',
  'closing on',
  'closes on',
  'closes',
  'application deadline',
  'deadline for applications',
  'deadline for application',
  'applications close',
  'applications must be received by',
  'apply by',
  'apply before',
  'last application date',
  'last date for applications',
  'last day for applications',
  'last day to apply',
  'last date',
  'last day',
  'deadline',
  'bewerbungsschluss',
  'bewerbungsfrist',
  'bewerbungen bis',
  'einsendeschluss',
  'date limite',
  'date de cloture',
  'fecha limite',
  'plazo de solicitud',
  'plazo',
  'scadenza',
  'termine per la presentazione',
  'sluitingsdatum',
  'uiterste reactiedatum',
  'reageren kan tot',
  'solliciteren kan tot',
  'sista ansokningsdag',
  'sista ansokningsdatum',
  'ansokan senast',
  'sidste frist',
  'ansogningsfrist',
  'ansøgningsfrist',
  'soknadsfrist',
  'søknadsfrist',
  'hakuaika paattyy',
  'haku paattyy',
  'son basvuru',
  'prazo',
  'data limite',
]

const LABEL = new RegExp(
  String.raw`(?<![\p{L}])(?:${LABELS.map((label) => label.replace(/ /g, String.raw`\s+`)).join('|')})(?![\p{L}])`,
  'gu',
)
// The same in scripts without spaces: Japanese, Chinese and Korean.
const LABEL_CJK =
  /応募締切|締切日?|締め切り|募集期限|截止日期|截止时间|截止|申请截止|마감일?|접수\s*마감/gu

/** How far after a label its date may stand. */
const NEAR = 90

const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th|er|\.|º)?`
const YEAR = String.raw`(\d{4})`
const PATTERNS: Array<{
  regexp: RegExp
  parts: (m: RegExpMatchArray, us: boolean) => [number, number, number] | null
}> = [
  // 2026-11-03, 2026/11/03, 2026.11.03
  {
    regexp: /(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/u,
    parts: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // 2026年11月3日, 2026년 11월 3일
  {
    regexp: /(20\d{2})\s*[年년]\s*(\d{1,2})\s*[月월]\s*(\d{1,2})\s*[日일]?/u,
    parts: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  // 3 November 2026, 3rd of November 2026, 3. November 2026, 03 Nov. 2026, 3 de noviembre de 2026
  {
    regexp: new RegExp(
      String.raw`(?<!\d)${DAY}\s*(?:of\s+|de\s+)?(${MONTH})\.?,?\s*(?:de\s+)?${YEAR}(?!\d)`,
      'u',
    ),
    parts: (m) => [Number(m[3]), MONTHS[m[2]!]!, Number(m[1])],
  },
  // November 3, 2026, Nov 3rd 2026
  {
    regexp: new RegExp(String.raw`(?<![\p{L}])(${MONTH})\.?\s+${DAY},?\s+${YEAR}(?!\d)`, 'u'),
    parts: (m) => [Number(m[3]), MONTHS[m[1]!]!, Number(m[2])],
  },
  // 03.11.2026, 3/11/2026, 11/3/2026 (United States), 03-11-2026, 03.11.26
  {
    regexp: /(?<![\d.])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d.]?\d)/u,
    parts: (m, us) => {
      const first = Number(m[1])
      const second = Number(m[2])
      const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      // Day first, except in the United States, unless the numbers say otherwise.
      if (first > 12) return [year, second, first]
      if (second > 12 || us) return [year, first, second]
      return [year, second, first]
    },
  },
]

/** Zones a posting names clearly; others (CET, CST, IST) are left to the institution's zone. */
const ZONES: Array<[RegExp, string]> = [
  [/\b(?:gmt|bst|uk time|british (?:summer )?time|london time)\b/, 'Europe/London'],
  [/\b(?:est|edt|eastern(?: standard| daylight)? time)\b/, 'America/New_York'],
  [/\b(?:pst|pdt|pacific(?: standard| daylight)? time)\b/, 'America/Los_Angeles'],
  [/\b(?:mountain(?: standard| daylight)? time)\b/, 'America/Denver'],
  [/\b(?:jst|japan standard time)\b/, 'Asia/Tokyo'],
  [/\b(?:kst|korea standard time)\b/, 'Asia/Seoul'],
  [/\b(?:sgt|singapore time)\b/, 'Asia/Singapore'],
  [/\b(?:aest|aedt|sydney time)\b/, 'Australia/Sydney'],
  [/\butc\b/, 'UTC'],
]

const pad = (n: number) => String(n).padStart(2, '0')

function validDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** The first date in `text` (folded), and where it ends. */
function firstDate(text: string, us: boolean): { date: string; end: number } | null {
  let best: { date: string; start: number; end: number } | null = null
  for (const { regexp, parts } of PATTERNS) {
    const match = regexp.exec(text)
    if (!match) continue
    const values = parts(match, us)
    const date = values && validDay(...values)
    if (!date) continue
    if (!best || match.index < best.start) {
      best = { date, start: match.index, end: match.index + match[0].length }
    }
  }
  return best ? { date: best.date, end: best.end } : null
}

/** The zone named just after the date ("… 23:59 UK time"), if a clear one. */
function zoneAfter(text: string): string | null {
  const near = text.slice(0, 40)
  for (const [regexp, zone] of ZONES) if (regexp.test(near)) return zone
  return null
}

const quote = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 120 ? `${one.slice(0, 117)}…` : one
}

/** Whether a found year is one a current posting could have. */
const plausible = (date: string, now: Date) => {
  const year = Number(date.slice(0, 4))
  return year >= now.getUTCFullYear() - 1 && year <= now.getUTCFullYear() + 3
}

/**
 * The deadline in a posting's text: the first date within a short distance after a deadline
 * word. `country` (ISO code) decides whether 3/11/2026 is in March (US) or November.
 */
export function deadlineFromText(
  text: string,
  country: string | null,
  now: Date,
): FoundDeadline | null {
  const folded = fold(text)
  const us = country === 'US'
  const labels = [...folded.matchAll(LABEL), ...text.matchAll(LABEL_CJK)].sort(
    (a, b) => a.index - b.index,
  )
  for (const label of labels) {
    const start = label.index + label[0].length
    const window = folded.slice(start, start + NEAR)
    const found = firstDate(window, us)
    if (!found || !plausible(found.date, now)) continue
    return {
      date: found.date,
      timeZone: zoneAfter(window.slice(found.end)),
      from: `the text: "${quote(text.slice(label.index, start + found.end))}"`,
    }
  }
  return null
}

/** The deadline in a JobPosting's `validThrough` ("2026-11-03" or "2026-11-03T23:59:00+01:00"). */
export function deadlineFromValidThrough(
  value: string | undefined,
  now: Date,
): FoundDeadline | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const date = validDay(Number(match[1]), Number(match[2]), Number(match[3]))
  if (!date || !plausible(date, now)) return null
  return {
    date,
    timeZone: null,
    from: `the posting's JobPosting data: validThrough ${quote(value)}`,
  }
}

/** "Open until filled", "rolling basis": a posting without a fixed day. */
export function openEndedFromText(
  text: string,
): { value: 'rolling' | 'until-filled'; from: string } | null {
  const folded = fold(text)
  const until =
    /until (?:the )?(?:position|post|role|vacancy) (?:is|has been) filled|open until filled|until filled/.exec(
      folded,
    )
  if (until)
    return {
      value: 'until-filled',
      from: `the text: "${quote(text.slice(until.index, until.index + until[0].length))}"`,
    }
  const rolling =
    /rolling basis|on a rolling|reviewed continuously|laufend|fortlaufend|in continu/.exec(folded)
  if (rolling)
    return {
      value: 'rolling',
      from: `the text: "${quote(text.slice(rolling.index, rolling.index + rolling[0].length))}"`,
    }
  return null
}

/**
 * Whether a posting whose deadline is `date` has closed: the day ended everywhere (a day after it
 * in UTC), so that a deadline is never taken for passed too early.
 */
export function hasClosed(date: string, now: Date): boolean {
  const end = Date.parse(`${date}T00:00:00Z`) + 2 * 86_400_000
  return end <= now.getTime()
}
