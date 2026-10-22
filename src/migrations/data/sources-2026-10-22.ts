// M7's third round (2026-10-22, docs/NEXT.md of that day; the operator's answers in the session):
// the sources the first weekly AI drafts showed to bring no postings or postings at other sites,
// and the operator's decisions on four open suggestions. Applied by the migration
// 20261022_120000_sources_round_3; every source as it stands after it:
// docs/sources/sources-2026-10-22.csv.

/** The day these changes were decided. */
export const CHANGES_DECIDED_ON = '2026-10-22'

/** Manual sources looked at weekly: their ads are open about 15 days (the operator's decision). */
export const WEEKLY = {
  note: "Weekly since M7's third round (the operator's decision of 2026-10-22): its ads are open about 15 days, so a monthly look could miss one.",
  urls: ['https://norbil.hacettepe.edu.tr/tr/duyurular', 'https://uskudar.edu.tr/duyurular'],
}

/** Automatic sources that become manual, weekly. */
export const TO_MANUAL = [
  {
    // The operator's decision of 2026-10-22.
    url: 'https://recruit.ap.uci.edu/apply',
    note: "Manual since M7's third round (the operator's decision of 2026-10-22): UC Irvine's copyright notice asks permission \"to use material from a UCI website\", so it is treated like UCSF and UC San Diego until the lawyer has answered B22.",
  },
  {
    url: 'https://institutosantosdumont.org.br/Not%C3%ADcias/oportunidades/feed/',
    note: "Manual since M7's third round (2026-10-22): the feed is the institute's news category, so it brought news items (one named a prize winner) besides calls, and ISD has no ROR record, so its candidates had no institution. An editor reads the calls on the Carreira page (oportunidades-e-vagas), whose adverts are PDFs.",
  },
  {
    url: 'https://norom.gazi.edu.tr/view/announcement-list/1?Type=1',
    note: "Manual since M7's third round (2026-10-22): the announcements are mostly not postings (admissions, calls for study participants, a procedure, a congress), about one a month; a weekly look finds the rare position.",
  },
]

/**
 * Shared boards whose postings are at several institutes or sites: the institution is taken from
 * each posting when it is decided (D59).
 */
export const SEVERAL_SITES = {
  note: "Its postings are at several sites since M7's third round (2026-10-22): each posting's institution is checked when it is decided (the Max Planck Society's institutes, VIB's centres, HHMI's labs at host universities, DZNE's sites).",
  sources: [
    { url: 'https://www.mpg.de/feeds/jobs.rss', patternHas: null },
    { url: 'https://jobs.vib.be/', patternHas: null },
    { url: 'https://jobs.dzne.de/sitemap.xml', patternHas: null },
    // HHMI's sitemap also serves Janelia's source, whose postings are all at Janelia: only the
    // source whose pattern leaves Janelia out.
    { url: 'https://hhmi.wd1.myworkdayjobs.com/External/siteMap.xml', patternHas: '(?!Janelia' },
  ],
}
