// M7's second round, after the report on the first four daily runs (2026-10-18 to 2026-10-21,
// `GET /api/ops/monitors/report/`) and the operator's decisions on terms of 2026-10-18 (docs/NEXT.md
// section 6, confirmed by the operator in the session of 2026-10-21). Applied by the migration
// 20261021_130000_sources_round_2_findings; every source as it stands after it:
// docs/sources/sources-2026-10-21.csv.

/** The day these changes were researched. */
export const CHANGES_CHECKED_ON = '2026-10-21'

/** NUS and Duke-NUS: both read from the NUS Careers sitemap, both left out. */
export const LEFT_OUT = {
  url: 'https://careers.nus.edu.sg/sitemap.xml',
  termsUrl: 'https://www.nus.edu.sg/legal-information-notices',
  termsCheckedOn: '2026-10-18',
  termsNote:
    'NUS\'s legal notice (read in a browser on 2026-10-18): "Deep linking to NUS web pages is prohibited"; a copy is allowed only for one\'s own information, research or study, unmodified. Our listings link to the posting\'s own page, which the notice forbids.',
  note: "Left out since M7's second round (the operator's decision of 2026-10-18): NUS's legal notice forbids deep links to its pages, and a listing links to the posting's own page (as with LIH and KEMRI-Wellcome). Kept only so that no one adds it again; never switch it on.",
}

/** UCSF: the University of California's shared terms restrict storing the site's content. */
export const UCSF = {
  url: 'https://aprecruit.ucsf.edu/apply',
  note: "Manual since M7's second round (the operator's decision of 2026-10-18): the University of California's shared terms allow only \"one copy for personal use\", which restricts storing content, as decided for Radboud, ETH Zurich and Tübingen on 2026-10-16. Its monitor was on from 2026-10-16 to 2026-10-21. To be read again once the lawyer has answered B22.",
}

/** Sources whose site refuses the monitor at its firewall: an editor reads them. */
export const FIREWALLED = [
  {
    url: 'https://www.crick.ac.uk/careers-and-study/vacancies',
    note: "Manual since M7's second round (2026-10-21): the site's firewall (Amazon CloudFront) answers the monitor with 403 on every run since 2026-10-17, from the server and from another network; the monitor never works around a refusal.",
  },
  {
    url: 'https://www.ku.edu.tr/en/academic-jobs/',
    note: "Manual since M7's second round (2026-10-21): the site's firewall (Amazon CloudFront) answers the monitor with 403 on every run since 2026-10-17, from the server and from another network; the monitor never works around a refusal.",
  },
]

/**
 * The borderline terms the operator read on 2026-10-18 as allowing our use (we keep only facts and
 * a redacted text for the editor, and publish our own summary with a link): switched on like the
 * other new sources once their run by hand has no failure.
 */
export const TERMS_READ = {
  note: "Terms read by the operator on 2026-10-18 as allowing our use (only facts and a redacted text for the editor are kept; the listing is our own summary with a link).",
  sources: [
    { url: 'https://jobs.bcm.edu/sitemap.xml', why: 'Baylor College of Medicine: only general reservations, as RIKEN\'s.' },
    { url: 'https://ntu.wd3.myworkdayjobs.com/Careers/siteMap.xml', why: 'NTU: only general reservations, as RIKEN\'s.' },
    { url: 'https://www.aku.edu/vacancies/Pages/search-jobs.aspx', why: 'Aga Khan University: downloads for information only, which is our use.' },
    { url: 'https://cinvestav.mx/Academia/Convocatorias/rss/category/3098/unidad-zacatenco', why: 'Cinvestav: information only by the means it offers; we read its own feeds.' },
    { url: 'https://cinvestav.mx/Academia/Convocatorias/rss/category/3098/sede-sur', why: 'Cinvestav: information only by the means it offers; we read its own feeds.' },
    { url: 'https://www.jobs.gla.ac.uk/job/sitemap.xml', why: 'Glasgow: internal or non-commercial copying; the site is non-commercial, so look again before any sponsorship (Phase 4).' },
    { url: 'https://jobs.unibas.ch/?lang=en&offset=0&limit=200', why: 'Basel: internal or non-commercial copying; the site is non-commercial, so look again before any sponsorship (Phase 4).' },
    { url: 'https://www.gu.se/en/work-at-the-university-of-gothenburg/vacancies', why: 'Gothenburg: internal or non-commercial copying; the site is non-commercial, so look again before any sponsorship (Phase 4).' },
  ],
}

/** UBC's Workday list stays manual (the operator's decision of 2026-10-18). */
export const UBC = {
  url: 'https://ubc.wd10.myworkdayjobs.com/ubcfacultyjobs',
  note: "Stays manual (the operator's decision of 2026-10-18).",
}

/** SISSA's list of its Neuroscience area: every posting on it is the area's. */
export const SISSA = {
  url: 'https://www.sissa.it/recruitment?is_open=1&area=1405',
  note: "Every posting here is in neuroscience since M7's second round (2026-10-21): the list is SISSA's Neuroscience area (area=1405), whose Italian calls name the area rather than neuroscience words, so three were skipped. The site was down for maintenance on 2026-10-21.",
}

/**
 * The Allen Institute: every posting ends with the institute's mission and the list of its
 * divisions, which made software and immunology posts pass the neuroscience check.
 */
export const ALLEN = {
  url: 'https://alleninstitute.hrmdirect.com/employment/job-openings.php?search=true',
  ignoredNames: [
    'how our brain, cells, and immune system work',
    'Brain Science, Cell Science, Immunology, Neural Dynamics',
    'neuroscience, cell science, immunology',
  ].join('\n'),
  note: "Names that do not count since M7's second round (2026-10-21): the paragraphs every posting repeats (the institute's mission, the list of its divisions), which made software, data and immunology posts pass the neuroscience check.",
}

/** Stanford's faculty list: five postings the first round's code checked by the page's title. */
export const STANFORD = {
  url: 'https://facultypositions.stanford.edu/jobs/search?department_uids%5B%5D=4dc99324942d116938c3316f14a721f9&department_uids%5B%5D=aaa561d260d37beb8e44bd4fef08c75b&department_uids%5B%5D=fcc687e8ffaa9547c20a6cf0135b31f8&department_uids%5B%5D=bc959e87b493dd4cccdd9dfe4c001d01',
  /** Postings first seen before the second round's rules (deployed on 2026-10-17). */
  before: '2026-10-18T00:00:00.000Z',
}

/** ELSC (the Hebrew University): checked from the server on 2026-10-21. */
export const ELSC = {
  url: 'https://elsc.huji.ac.il/opportunities/postdoctoral-program/opportunities/',
  note: 'Unreachable from the server too (2026-10-21): elsc.huji.ac.il, www.huji.ac.il, en.huji.ac.il and ttp.huji.ac.il all timed out after 15 s. An editor may need to open it from a network the site answers.',
}

export type ManualSeed = {
  key: string
  name: string
  country: string
  rorId: string | null
  url: string
  schedule: 'weekly' | 'monthly'
  termsUrl: string | null
  termsAutomation: 'not-stated' | 'allows' | 'forbids' | 'not-found'
  termsNote: string | null
  notes: string
}

/**
 * The new manual sources (the operator's decisions of 2026-10-18), researched on 2026-10-21 from
 * their official sites: none of their terms forbids a link to a posting's own page.
 */
export const NEW_MANUAL: ManualSeed[] = [
  {
    key: 'ucsd-apol-recruit',
    name: 'UC San Diego – academic recruitments (UC Recruit), keyword “neuro”',
    country: 'US',
    rorId: '0168r3w48',
    url: 'https://apol-recruit.ucsd.edu/apply?q=neuro',
    schedule: 'weekly',
    termsUrl: 'https://ucsd.edu/about/terms-of-use.html',
    termsAutomation: 'not-stated',
    termsNote:
      '"No material from any official UC San Diego website may be copied, reproduced, republished, uploaded, posted, transmitted, or distributed in any way, without explicit permission, except that you may download one copy … for your personal, non-commercial home use only." The University of California\'s shared wording: manual, as UCSF (the operator\'s decision of 2026-10-18); to be read again once the lawyer has answered B22. Nothing on links.',
    notes:
      "Manual (the operator's decision of 2026-10-18): UC's shared terms restrict storing content. A link to a posting's own page: not forbidden (the terms say nothing on links).\nPlatform: UC Recruit, server-rendered HTML grouped by division and department (229 open recruitments on 2026-10-21); ?q= filters on the server: ?q=neuro gave 17 (Neurobiology, Neurosciences, Neurological Surgery, neuroradiology, neuropathology, neurotology), ?q=psychiatr 4, ?q=cogniti 2 (Cognitive Science, Psychology): look at those too.\nPostings: https://apol-recruit.ucsd.edu/JPF<5 digits>; one recruitment can be listed under several departments (one JPF number, one posting).\nDeadline on postings: \"Next review date: … Apply by this date to ensure full consideration\" and \"Final date: …\", the hard close; the list shows \"Apply by Nov 22, 2026 for full consideration\". About 3-5 new neuro-relevant postings a month, many clinical (HS Clinical, Clinical X): check that they fit.\nrobots.txt (2026-10-21): User-Agent: * / Disallow: /survey/take/.",
  },
  {
    key: 'hacettepe-norbil',
    name: 'Hacettepe University – Institute of Neurological Sciences and Psychiatry, announcements (Nörolojik Bilimler ve Psikiyatri Enstitüsü, Duyurular)',
    country: 'TR',
    rorId: '04kwvgz42',
    url: 'https://norbil.hacettepe.edu.tr/tr/duyurular',
    schedule: 'monthly',
    termsUrl: null,
    termsAutomation: 'not-found',
    termsNote:
      'No terms of use or legal notice on norbil.hacettepe.edu.tr or www.hacettepe.edu.tr (only "© Copyright 2021 Hacettepe Üniversitesi | Her Hakkı Saklıdır" in the footer). Nothing on links or automated reading.',
    notes:
      "Manual (the operator's decision of 2026-10-18): the ads are PDFs (and fs.hacettepe.edu.tr's robots.txt disallows everything). A link to a posting's own page: not forbidden (no terms found); link the ad's PDF, or the announcement.\nPlatform: the institute's own site; a plain-HTML table of announcements, newest first, mostly course schedules; job ads and their results are file links (PDF or .docx).\nNeuroscience posts: 0 open on 2026-10-21; one research assistant post in 2026 (listed 11.09.2026, closed 25.09.2026), the one before in January 2024. Each ad is open about 15 days, so a monthly look may miss one: weekly would be safer.\nThe university's faculty ads (about 4-5 a year, a few neuro-relevant rows: child neurology, neuroanaesthesia, neurological physiotherapy) are PDFs at https://www.hacettepe.edu.tr/duyurular/guncel-duyurular, and research assistant ads at https://www.hacettepe.edu.tr/duyurular/rektorluk-duyurulari; the page is-ilanlari is empty.\nDeadline on postings (Turkish): \"SON BAŞVURU TARİHİ : 25 Eylül 2026\"; faculty ads \"25 Eylül – 9 Ekim 2026 tarihleri arasında\".\nThe results files name candidates: never copy them.",
  },
  {
    key: 'uskudar-duyurular',
    name: 'Üsküdar University – announcements, academic staff ads (Üsküdar Üniversitesi, Akademik Kadro İlanı)',
    country: 'TR',
    rorId: '02dzjmc73',
    url: 'https://uskudar.edu.tr/duyurular',
    schedule: 'monthly',
    termsUrl: 'https://uskudar.edu.tr/uskudar-universitesi-gizlilik-politikasi',
    termsAutomation: 'forbids',
    termsNote:
      '"Kullanım Koşulları": "hiç bir şekilde içeriklerin sistematik yollarla indirilmesi ve depolanması kabul edilemez ve kesinlikle izin verilmez"; content "kopyalanarak tekrar başka sitelerde çevrimiçi olarak kesinlikle yayınlanamaz" (English page: https://uskudar.edu.tr/en/uskudar-university-privacy-policy). Nothing on links: write the listing in our own words.',
    notes:
      "Manual: the terms forbid systematic downloading and storage (the operator's decision of 2026-10-18: an editor may read it). A link to a posting's own page: not forbidden (the terms say nothing on links).\nPlatform: the university's site (server-rendered); no list of job ads alone: the \"Akademik Kadro İlanı\" pages sit among all announcements, and only the 12 newest are in the page (older ones load through /api/, which robots.txt disallows).\nPostings: https://uskudar.edu.tr/duyuru/<ddmmyyyy>-tarihli-akademik-kadro-ilani/<id>; results pages are separate and may name candidates: never copy them.\nNeuroscience posts: 0 open on 2026-10-21; the ad of 07.07.2026 had about 8 neuro-relevant posts (neurology, neurosurgery, molecular neuroscience, clinical psychology). About 3-4 ads a year, each open about 14 days, so a monthly look may miss one: weekly would be safer.\nDeadline on postings (Turkish): \"Son Başvuru Tarihi 21.07.2026\".\nrobots.txt (2026-10-21): User-agent: * / Allow: / / Disallow: /api/, /*?*.",
  },
  {
    key: 'sabanci-academic-positions',
    name: 'Sabancı University – academic positions',
    country: 'TR',
    rorId: '049asqa32',
    url: 'https://www.sabanciuniv.edu/en/academic-positions',
    schedule: 'monthly',
    termsUrl: 'https://www.sabanciuniv.edu/en/gizlilik-bildirimi',
    termsAutomation: 'not-stated',
    termsNote:
      '"all articles, and all kinds of materials … are the property of Sabancı University and are protected by copyright and cannot be partially or completely quoted or used without permission"; copying pages for commercial purposes is prohibited. Nothing on links or automated access as such; the use of content needs permission, so it stays manual and we write our own words.',
    notes:
      "Manual (the operator's decision of 2026-10-18): the terms restrict using the site's content. A link to a posting's own page: not forbidden (the terms say nothing on links).\nPlatform: Drupal, plain HTML (Turkish: https://www.sabanciuniv.edu/tr/akademik-ilanlar); postings https://www.sabanciuniv.edu/tr/node/<id> (the /tr/ address is canonical even for English text).\nNeuroscience posts: 0 of 1 open on 2026-10-21; neuro-relevant posts (Molecular Biology, Genetics and Bioengineering; Psychology) appear about once or twice a year and stay open for months.\nDeadline on postings: \"Applications will be reviewed on a rolling basis\" or \"Application Deadline: 01.05.2026\".\nResearch assistant and PhD calls are on the faculty's site instead (https://fens.sabanciuniv.edu/en/announcements, mixed with course news); administrative posts go to job boards: not for us.\nrobots.txt (2026-10-21): Drupal's defaults; the list and postings are allowed.",
  },
]
