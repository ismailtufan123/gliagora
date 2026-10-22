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
  'final date',
  'last date for applications',
  'last day for applications',
  'last day to apply',
  'last date',
  'last day',
  'submission deadlines for applications',
  'deadlines for applications',
  'submission deadline',
  'application deadlines',
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
  // 3 November 2026, 3rd of November 2026, 3. November 2026, 03 Nov. 2026, 3 de noviembre de 2026,
  // 19-Oct-2026
  {
    regexp: new RegExp(
      String.raw`(?<!\d)${DAY}[\s-]*(?:of\s+|de\s+)?(${MONTH})\.?,?[\s-]*(?:de\s+)?${YEAR}(?!\d)`,
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

/** The first date in `text` (folded), and where it starts and ends. */
function firstDate(text: string, us: boolean): { date: string; start: number; end: number } | null {
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
  return best
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

/**
 * A deadline further ahead than this is a placeholder ("31/12/2035"), not a day: the posting is
 * open until filled, and counts as rolling (M7, third round).
 */
export const PLACEHOLDER_AFTER_DAYS = 730

/** Whether a found day is one a current posting's deadline could be. */
const plausible = (date: string, now: Date) => {
  const year = Number(date.slice(0, 4))
  return (
    year >= now.getUTCFullYear() - 1 &&
    Date.parse(`${date}T00:00:00Z`) <= now.getTime() + PLACEHOLDER_AFTER_DAYS * 86_400_000
  )
}

/** Whether `date` (YYYY-MM-DD) is so far ahead that it stands for "no deadline". */
export function isPlaceholderDeadline(date: string, now: Date): boolean {
  return Date.parse(`${date}T00:00:00Z`) > now.getTime() + PLACEHOLDER_AFTER_DAYS * 86_400_000
}

// A range's end: "21.10.2026 – 04.11.2026", "from 21 October 2026 to 4 November 2026", "del 21 de
// octubre al 4 de noviembre de 2026" (Udelar). The deadline is its last day.
const RANGE =
  /^[^\S\n]*(?:-|–|—|to|until|till|through|thru|al|a|hasta|bis|au|t\/m|tot|fino al|ate|ila)[^\S\n]+|^[^\S\n]*[-–—][^\S\n]*/u

/** A range longer than this is two dates, not an application period. */
const RANGE_MAX_DAYS = 90

/** The last day of a range that starts at `found` (in `window`, folded), or `found` itself. */
function rangeEnd<T extends { date: string; end: number }>(
  window: string,
  found: T,
  us: boolean,
): T {
  const rest = window.slice(found.end)
  const connector = RANGE.exec(rest)
  if (!connector) return found
  const after = rest.slice(connector[0].length, connector[0].length + 40)
  const next = firstDate(after, us)
  // The second date must start right after the connector ("21.10.2026 - 12:00" is a time), come
  // later and within a few months: "15 November 2026 – 1 March 2027 start" is a deadline and a
  // start, "30.11.2026 - 31.10.2030 (contract)" a deadline and a contract.
  if (!next || next.start !== 0 || next.date <= found.date) return found
  if (Date.parse(next.date) - Date.parse(found.date) > RANGE_MAX_DAYS * 86_400_000) return found
  return { ...found, date: next.date, end: found.end + connector[0].length + next.end }
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
    // UC Recruit: "Apply by this date to ensure full consideration" follows its review date, and
    // "For full consideration, apply by …" gives one.
    if (/^[^\S\n]*this date/.test(window)) continue
    const before = folded.slice(Math.max(0, label.index - 60), label.index)
    if (/(?:full|priority)\s+consideration[^\n.;]*$|priority[^\S\n]*$/.test(before)) continue
    const first = firstDate(window, us)
    if (!first || !plausible(first.date, now)) continue
    const range = rangeEnd(window, first, us)
    const found = plausible(range.date, now) ? range : first
    return {
      date: found.date,
      timeZone: zoneAfter(window.slice(found.end)),
      from: `the text: "${quote(text.slice(label.index, start + found.end))}"`,
    }
  }
  return null
}

/** Words that introduce a review date, which is not a deadline (UC Recruit), folded. */
const REVIEW_LABELS = [
  'next review date',
  'initial review date',
  'first review date',
  'review date',
  'review of applications will begin on',
  'review of applications will begin',
  'review of applications begins on',
  'review of applications begins',
  'applications will be reviewed beginning',
  'applications will be reviewed starting',
  'screening will begin',
  'screening begins',
  'for full consideration, apply by',
  'for full consideration apply by',
  'priority deadline',
  'priority consideration date',
  'priority date',
]
const REVIEW_LABEL = new RegExp(
  String.raw`(?<![\p{L}])(?:${REVIEW_LABELS.map((label) => label.replace(/ /g, String.raw`\s+`)).join('|')})(?![\p{L}])`,
  'gu',
)

/**
 * The days a posting's text gives as review dates ("Next review date: Monday, Nov 3, 2026"): UC
 * Recruit writes the first one into its JobPosting data as `validThrough`, while its deadline is
 * the "Final date", or none (open until filled). M7, third round.
 */
export function reviewDates(text: string, country: string | null, now: Date): Set<string> {
  const folded = fold(text)
  const days = new Set<string>()
  for (const label of folded.matchAll(REVIEW_LABEL)) {
    const start = label.index + label[0].length
    const found = firstDate(folded.slice(start, start + NEAR), country === 'US')
    if (found && plausible(found.date, now)) days.add(found.date)
  }
  return days
}

/**
 * A placeholder for "no deadline" ("Closing date: 31/12/2035", `validThrough` 2099-12-31): the
 * first deadline the data or the text gives is more than two years ahead. Such a posting counts as
 * rolling (M7, third round).
 */
export function placeholderDeadline(
  text: string,
  validThrough: string | undefined,
  country: string | null,
  now: Date,
): { value: 'rolling'; from: string } | null {
  const data = /^(\d{4})-(\d{2})-(\d{2})/.exec(validThrough?.trim() ?? '')
  if (data) {
    const date = validDay(Number(data[1]), Number(data[2]), Number(data[3]))
    if (date && isPlaceholderDeadline(date, now)) {
      return {
        value: 'rolling',
        from: `the posting's JobPosting data: validThrough ${quote(validThrough!)}, a placeholder`,
      }
    }
    return null
  }
  const folded = fold(text)
  for (const label of folded.matchAll(LABEL)) {
    const start = label.index + label[0].length
    const found = firstDate(folded.slice(start, start + NEAR), country === 'US')
    if (!found) continue
    if (!isPlaceholderDeadline(found.date, now)) return null
    return {
      value: 'rolling',
      from: `the text: "${quote(text.slice(label.index, start + found.end))}", a placeholder`,
    }
  }
  return null
}

/**
 * The deadline a list gives in a column of its own (IBS's "Closing Date"): the cell's first date,
 * which counts as the source's data, like `validThrough`.
 */
export function deadlineFromList(
  listed: { label: string; value: string } | undefined,
  country: string | null,
  now: Date,
): FoundDeadline | null {
  if (!listed) return null
  const value = fold(listed.value)
  const first = firstDate(value, country === 'US')
  if (!first) return null
  const range = rangeEnd(value, first, country === 'US')
  const found = plausible(range.date, now) ? range : first
  if (!plausible(found.date, now)) return null
  return {
    date: found.date,
    timeZone: zoneAfter(fold(listed.value).slice(found.end)),
    from: `the list: ${quote(`${listed.label}: ${listed.value}`)}`,
  }
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
  // Only phrases about the applications: "laufend" alone is any ongoing thing ("laufende
  // Projekte"), "in continu" a Dutch shift pattern (M7, third round: four postings were read as
  // rolling from such words).
  const rolling =
    /(?:on a )?rolling basis|rolling (?:admissions?|applications?|deadline|review)|(?:reviewed|considered|assessed) (?:continuously|on an ongoing basis|as (?:they are|they're) received)|until a suitable candidate (?:is|has been) (?:found|identified|appointed)|bewerbungen werden (?:fort)?laufend|(?:fort)?laufend (?:gesichtet|berucksichtigt|bearbeitet|gepruft|entgegengenommen|ausgewertet)|bewerbungsfrist:? (?:fort)?laufend|candidatures? (?:sont |seront )?(?:examinees|traitees|etudiees) (?:en continu|au fil de l'eau)|doorlopend (?:solliciteren|werving)/.exec(
      folded,
    )
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

// When a posting was published (M7, second round): "open until filled" posts can stay on a list
// long after they were filled (RIKEN CBS listed posts from 2025). Academic posts without a fixed
// deadline are mostly filled within two to four months, so from 60 days the editor is told to
// check that the post is still open, and after 180 days (the monitor's memory of a posting too) it
// is skipped: by then it is more likely filled than open. Only a day the source gives as data (the
// posting's JSON-LD, the feed or API, a dated address) skips a posting; a day read from its text
// only marks it, since text can name other days. A posting with a fixed deadline is judged by its
// deadline alone.

/** From this age (days since published), a posting without a fixed deadline may be filled. */
export const POSSIBLY_FILLED_DAYS = 60

/** Over this age, a posting without a fixed deadline is skipped as old. */
export const OPEN_ENDED_MAX_DAYS = 180

/** Words that introduce the day a posting was published, folded. */
const PUBLISHED_LABELS = [
  'date posted',
  'posted on',
  'posted',
  'posting date',
  'posting start date',
  'date of posting',
  'published on',
  'published',
  'publication date',
  'date of publication',
  'date advertised',
  'advertised on',
  'advertised',
  'veroffentlicht am',
  'veroffentlicht',
  'veroffentlichungsdatum',
  'ausschreibungsdatum',
  'date de publication',
  'publie le',
  'fecha de publicacion',
  'publicado el',
  'publicado em',
  'data de publicacao',
  'data di pubblicazione',
  'pubblicato il',
  'publicatiedatum',
  'gepubliceerd op',
  'publiceringsdatum',
  'publicerad',
  'ilan tarihi',
  'yayin tarihi',
  'yayinlanma tarihi',
]
const PUBLISHED_LABEL = new RegExp(
  String.raw`(?<![\p{L}])(?:${PUBLISHED_LABELS.map((label) => label.replace(/ /g, String.raw`\s+`)).join('|')})(?![\p{L}])`,
  'gu',
)
const PUBLISHED_LABEL_CJK =
  /掲載日|公開日|登録日|発表日|发布时间|发布日期|发布于|게시일|등록일|작성일/gu

/** How far after a "published" label its date may stand: right after it ("Posted: 12 March 2025"). */
const PUBLISHED_NEAR = 25

/** Whether `date` (YYYY-MM-DD) is a day a current posting could have been published on. */
const pastDay = (date: string, now: Date) => {
  const at = Date.parse(`${date}T00:00:00Z`)
  return at <= now.getTime() + 86_400_000 && at >= now.getTime() - 10 * 366 * 86_400_000
}

/**
 * The calendar day of an ISO date or date-time, of a date a feed or an API gives, or of a date a
 * list's cell writes as people do ("21.10.2026", "3 November 2026"; `country` decides 3/11).
 */
export function dayOf(
  value: string | undefined | null,
  now: Date,
  country: string | null = null,
): string | null {
  if (!value) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  let date: string | null = null
  if (iso) date = validDay(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  // Else our own reading, which needs a day ("Wed, 12 Mar 2025 09:30:00 GMT", "21.10.2026"):
  // JavaScript's would take 10.11.2026 for 11 October and "March 2026" for a day, in local time.
  else date = firstDate(fold(value), country === 'US')?.date ?? null
  return date && pastDay(date, now) ? date : null
}

/** The day a posting's text says it was published ("Posted: 12 March 2025"). */
export function publishedFromText(
  text: string,
  country: string | null,
  now: Date,
): { date: string; from: string } | null {
  const folded = fold(text)
  const labels = [...folded.matchAll(PUBLISHED_LABEL), ...text.matchAll(PUBLISHED_LABEL_CJK)].sort(
    (a, b) => a.index - b.index,
  )
  for (const label of labels) {
    const start = label.index + label[0].length
    // A field of the posting ("Posted: …", a line "Date posted 2025-03-12"), not a sentence that
    // mentions a publication ("whose work was published 3 May 2019 in …").
    const atLineStart = /(?:^|\n)[^\S\n]*$/.test(
      folded.slice(Math.max(0, label.index - 40), label.index),
    )
    if (!atLineStart && !/^[^\S\n]*:/.test(folded.slice(start, start + 5))) continue
    const window = folded.slice(start, start + PUBLISHED_NEAR)
    const found = firstDate(window, country === 'US')
    if (!found || !pastDay(found.date, now)) continue
    return {
      date: found.date,
      from: `the text: "${quote(text.slice(label.index, start + found.end))}"`,
    }
  }
  return null
}

/**
 * The day in a posting's address, where a site names its postings by it: RIKEN's
 * /careers/researchers/20250512_1/, a CMS's /202601/t20260115_123.html, a blog's /2026/03/15/.
 */
export function publishedFromAddress(
  address: string,
  now: Date,
): { date: string; from: string } | null {
  let path: string
  try {
    path = new URL(address).pathname
  } catch {
    return null
  }
  // Only forms that are clearly a day: RIKEN's 20250512_1, a CMS's t20260115_…, a path
  // /2026/03/15/; never a bare eight-digit number, which may be an ID.
  const patterns = [
    /\/(20\d{2})(\d{2})(\d{2})_\d+(?:\.s?html?)?(?=\/|$)/,
    /\/t(20\d{2})(\d{2})(\d{2})(?:_\d+)?(?:\.s?html?)?(?=\/|$)/,
    /\/(20\d{2})\/(\d{2})\/(\d{2})(?=\/)/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(path)
    if (!match) continue
    const date = validDay(Number(match[1]), Number(match[2]), Number(match[3]))
    if (date && pastDay(date, now)) return { date, from: `the posting's address: ${quote(path)}` }
  }
  return null
}

/** Whole days from `date` (YYYY-MM-DD) to `now`. */
export function ageInDays(date: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
}
