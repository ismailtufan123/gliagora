import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SOURCES_2026_10 } from './data/sources-2026-10'

// M7's second round: the manual sources that M7 saw could be read with a small adapter ("Seen on
// the way", PLAN §20) become automatic, as researched on 2026-10-17 from their robots.txt and
// sitemaps: the Workday career sites of Janelia (HHMI), CSHL, McGill and EMBL, DZNE's and Helmholtz
// Munich's job sites through the sitemaps their robots.txt names (posting pages in plain HTML or
// with JobPosting data), and Oxford's two CoreHR lists through the posting address built from each
// link's ID. HHMI's postings outside Janelia join as a source of their own. UBC's and UQ's Workday
// sites stay manual: their terms limit the use of the site's information, or forbid systematic
// retrieval. "Monitor on" stays unticked: each is run by hand first, then switched on
// (/api/ops/monitors/switch-on/). Matched by their seeded address (20261016_120000_seed_sources).

type Conversion = {
  from: string
  name: string
  kind: 'sitemap' | 'page'
  url: string
  postingPattern: string | null
  postingIdPattern?: string
  postingUrlTemplate?: string
  note: string
}

const CHECKED = '2026-10-17'

const OXFORD_SPEC =
  'https://my.corehr.com/pls/uoxrecruit/erq_jobspec_version_4.display_form?p_company=10&p_internal_external=E&p_display_in_irish=N&p_process_type=&p_applicant_no=&p_form_profile_detail=&p_display_apply_ind=Y&p_refresh_search=Y&p_recruitment_id={id}'

const workday = (from: string, name: string, base: string, site: string, extra = '') => ({
  from,
  name,
  kind: 'sitemap' as const,
  url: `${base}/${site}/siteMap.xml`,
  postingPattern: `^${base.replace(/\./g, '\\.')}/${site}/job/[^/]+/[^/]+$`,
  note: `Automatic since M7's second round (${CHECKED}): the Workday sitemap that robots.txt names (${base}/${site}/siteMap.xml) lists every posting page, and each carries JobPosting data (title, description, datePosted) in its plain HTML; the Workday list itself needs JavaScript.${extra}`,
})

const CONVERSIONS: Conversion[] = [
  {
    ...workday(
      'https://www.hhmi.org/careers/janelia',
      'Janelia Research Campus (HHMI) – Workday postings (sitemap)',
      'https://hhmi.wd1.myworkdayjobs.com',
      'External',
      " Only Janelia's postings (location Janelia-Research-Campus in the address); HHMI's others are the next source. This replaces the hhmi.org page, whose list is JSON in an attribute.",
    ),
    postingPattern:
      '^https://hhmi\\.wd1\\.myworkdayjobs\\.com/External/job/Janelia-Research-Campus/[^/]+$',
  },
  workday(
    'https://cshl.wd12.myworkdayjobs.com/CSHL',
    'Cold Spring Harbor Laboratory – Workday postings (sitemap)',
    'https://cshl.wd12.myworkdayjobs.com',
    'CSHL',
  ),
  workday(
    'https://mcgill.wd3.myworkdayjobs.com/en-US/McGill_Careers/jobs?q=neurology&workerSubType=5b8bbc1be9ca0137be53d240de00840e&workerSubType=5b8bbc1be9ca01d9ed26d340de00890e',
    'McGill University – Workday postings (sitemap)',
    'https://mcgill.wd3.myworkdayjobs.com',
    'McGill_Careers',
    ' The sitemap held 100 postings on 2026-10-17, perhaps a cap of Workday, so some may be missing: The Neuro’s academic search (q=neurology) stays worth a monthly look by hand.',
  ),
  workday(
    'https://embl.wd103.myworkdayjobs.com/EMBL',
    'EMBL – Workday postings (sitemap)',
    'https://embl.wd103.myworkdayjobs.com',
    'EMBL',
  ),
  {
    from: 'https://jobs.dzne.de/en/jobs',
    name: 'DZNE – job postings (sitemap, English)',
    kind: 'sitemap',
    url: 'https://jobs.dzne.de/sitemap.xml',
    postingPattern: '^https://jobs\\.dzne\\.de/en/jobs/\\d+/[a-z0-9-]+$',
    note: `Automatic since M7's second round (${CHECKED}): the sitemap that robots.txt names lists the posting pages, which are plain HTML (title in the h1). It holds a German and an English page with different IDs for many ads; the pattern keeps the English ones, so German-only ads (mostly training places and technical posts) are not read.`,
  },
  {
    from: 'https://www.helmholtz-munich.de/en/career/jobs',
    name: 'Helmholtz Munich – job postings (sitemap)',
    kind: 'sitemap',
    url: 'https://jobs.helmholtz-muenchen.de/sitemap.xml.gz',
    postingPattern: '^https://jobs\\.helmholtz-muenchen\\.de/jobposting/[0-9a-f]{40}$',
    note: `Automatic since M7's second round (${CHECKED}): the sitemap that robots.txt names (served as plain XML despite its .gz name; the monitor unpacks a gzipped one too) lists the posting pages, which carry JobPosting data with validThrough.`,
  },
  {
    from: 'https://my.corehr.com/pls/uoxrecruit/erq_search_version_4.start_search_with_params?p_company=10&p_internal_external=E&p_display_in_irish=N&p_competition_type=RE&p_force_type=E',
    name: 'University of Oxford – CoreHR research vacancies',
    kind: 'page',
    url: 'https://my.corehr.com/pls/uoxrecruit/erq_search_version_4.start_search_with_params?p_company=10&p_internal_external=E&p_display_in_irish=N&p_competition_type=RE&p_force_type=E',
    postingPattern: null,
    postingIdPattern: "^javascript:viewTheJobSpec\\('(\\d+)'\\)$",
    postingUrlTemplate: OXFORD_SPEC,
    note: `Automatic since M7's second round (${CHECKED}): the list's links are javascript:viewTheJobSpec('<id>'); the monitor reads each posting at its plain address (erq_jobspec_version_4.display_form … &p_recruitment_id=<id>), checked on 2026-10-17 (plain HTML, 'Closing Date & Time : 19-Oct-2026 12:00'). The page's own title is only 'Job Details', so the list's link names the posting.`,
  },
  {
    from: 'https://my.corehr.com/pls/uoxrecruit/erq_search_version_4.start_search_with_params?p_company=10&p_internal_external=E&p_display_in_irish=N&p_competition_type=AC&p_force_type=E',
    name: 'University of Oxford – CoreHR academic vacancies',
    kind: 'page',
    url: 'https://my.corehr.com/pls/uoxrecruit/erq_search_version_4.start_search_with_params?p_company=10&p_internal_external=E&p_display_in_irish=N&p_competition_type=AC&p_force_type=E',
    postingPattern: null,
    postingIdPattern: "^javascript:viewTheJobSpec\\('(\\d+)'\\)$",
    postingUrlTemplate: OXFORD_SPEC,
    note: `Automatic since M7's second round (${CHECKED}): as the research list, with p_competition_type=AC.`,
  },
]

/** Kept manual, with the reason added to their notes. */
const KEPT_MANUAL: Array<{ url: string; note: string }> = [
  {
    url: 'https://ubc.wd10.myworkdayjobs.com/ubcfacultyjobs',
    note: `Kept manual in M7's second round (${CHECKED}): the Workday sitemap adapter could read it (https://ubc.wd10.myworkdayjobs.com/ubcfacultyjobs/siteMap.xml, 36 postings), but UBC's legal notice limits the use of the site's information to short extracts for personal, non-commercial use and forbids republishing; like the sources whose terms restrict storing content, the operator decides.`,
  },
]

const HHMI = {
  name: 'Howard Hughes Medical Institute – Workday postings outside Janelia (sitemap)',
  rorId: '006w34k90',
  url: 'https://hhmi.wd1.myworkdayjobs.com/External/siteMap.xml',
  postingPattern:
    '^https://hhmi\\.wd1\\.myworkdayjobs\\.com/External/job/(?!Janelia-Research-Campus/)[^/]+/[^/]+$',
  termsUrl: 'https://www.hhmi.org/terms-of-use',
  termsNote:
    '"You agree not to: ... (e) use any automatic device, process or means to access the Sites for any purpose that violates these Terms of Use." Automated access is forbidden only for purposes that violate the terms. Section 1 forbids reproducing or republishing Content without permission (the same general reservation as RIKEN\'s); the Workday career site shows no terms of its own.',
  notes: `Added in M7's second round (${CHECKED}).\nPlatform: Workday (hhmi.wd1.myworkdayjobs.com/External)\nNeuroscience posts: few; most of HHMI's postings outside Janelia are headquarters posts and posts in HHMI investigators' labs at host universities (some in neuroscience)\nDeadline on postings: none in the JobPosting data seen (datePosted only)\nrobots.txt (${CHECKED}): User-agent: * Allow: /External/; Disallow: /OGC_Intern/, /Pres_Fellows/, /refreshFacet/. Sitemap: https://hhmi.wd1.myworkdayjobs.com/External/siteMap.xml\nThe sitemap lists every HHMI posting (26 on ${CHECKED}); the pattern leaves out Janelia's, which have their own source. Lab posts at a host university name it in the address (e.g. 'Rockefeller-University---…'): change a candidate's institution to the lab's host when accepting.`,
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const c of CONVERSIONS) {
    await db.execute(sql`
      update sources set name = ${c.name}, kind = ${c.kind}, url = ${c.url},
        posting_pattern = ${c.postingPattern}, posting_id_pattern = ${c.postingIdPattern ?? null},
        posting_url_template = ${c.postingUrlTemplate ?? null}, schedule = 'daily', active = false,
        notes = ${`${c.note}\n`} || coalesce(notes, ''), updated_at = now()
      where url = ${c.from} and kind = 'manual'`)
  }
  for (const k of KEPT_MANUAL) {
    await db.execute(sql`
      update sources set notes = ${`${k.note}\n`} || coalesce(notes, ''), updated_at = now()
      where url = ${k.url} and kind = 'manual'`)
  }
  await db.execute(sql`
    insert into sources (name, institution_id, kind, schedule, url, posting_pattern,
      all_neuroscience, active, terms_url, terms_automation, terms_checked_at, terms_note, notes)
    select ${HHMI.name}, (select id from institutions where ror_id = ${HHMI.rorId}), 'sitemap',
      'daily', ${HHMI.url}, ${HHMI.postingPattern}, false, false, ${HHMI.termsUrl}, 'not-stated',
      ${`${CHECKED}T12:00:00.000Z`}, ${HHMI.termsNote}, ${`${HHMI.notes}\nROR ID of the employer: ${HHMI.rorId}`}
    where not exists (select 1 from sources where url = ${HHMI.url} and name = ${HHMI.name})`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const hhmi = sql`select id from sources where url = ${HHMI.url} and name = ${HHMI.name}`
  await db.execute(sql`delete from source_postings where source_id in (${hhmi})`)
  await db.execute(sql`delete from source_runs where source_id in (${hhmi})`)
  await db.execute(sql`delete from sources where id in (${hhmi})`)
  for (const k of KEPT_MANUAL) {
    await db.execute(sql`
      update sources set notes = replace(notes, ${`${k.note}\n`}, ''), updated_at = now()
      where url = ${k.url}`)
  }
  for (const c of CONVERSIONS) {
    const seeded = SOURCES_2026_10.find((source) => source.url === c.from)
    await db.execute(sql`
      update sources set name = ${seeded?.name ?? c.name}, kind = 'manual', url = ${c.from},
        posting_pattern = null,
        posting_id_pattern = null, posting_url_template = null, schedule = 'weekly',
        active = false, notes = replace(notes, ${`${c.note}\n`}, ''), updated_at = now()
      where url = ${c.url} and name = ${c.name}`)
  }
}
