// Generated fake jobs for local development and CI (D38): plausible but plainly generic titles and
// summaries, no real people, labs, email addresses or phone numbers, and addresses on the reserved
// example.org domain. A seeded random generator makes every run produce the same jobs; only the
// dates move with the day of the run. src/scripts/fake-jobs.ts stores them.

import { addDays, calendarDay, deadlineEnd, storedDay } from '@/lib/jobs/deadline'
import { type DedupeFacts, likelyDuplicate, normaliseTitle } from '@/lib/jobs/similarity'

import { FIXED_JOBS, type FixedJob } from './fake-jobs-fixed'

/** The address of a fake posting, on the reserved example.org domain. */
export const postingUrl = (rorId: string, id: string) =>
  `https://careers.example.org/${rorId}/positions/${id}`

/** Marks every fake job (in `internalNotes`), so the next run can remove them first. */
export const FAKE_NOTE = 'Fake data (pnpm fake:jobs)'

const SEED = 20260928
const RANDOM_JOBS = 60
const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

/**
 * Institutions of the ROR test data (tests/fixtures/ror) that could plausibly post these jobs, with
 * the time zone their coordinates give (a test checks it), which their jobs take (D40).
 */
export const FAKE_INSTITUTIONS = [
  { rorId: '05dxps055', timeZone: 'America/Los_Angeles' },
  { rorId: '02h1nk258', timeZone: 'Europe/Berlin' },
  { rorId: '056d84691', timeZone: 'Europe/Stockholm' },
  { rorId: '03cpe7c52', timeZone: 'America/Los_Angeles' },
  { rorId: '03g001n57', timeZone: 'Europe/Lisbon' },
  { rorId: '03gnh5541', timeZone: 'Europe/Vienna' },
  { rorId: '053sba816', timeZone: 'Europe/Amsterdam' },
  { rorId: '04kwvgz42', timeZone: 'Europe/Istanbul' },
  { rorId: '00jzwgz36', timeZone: 'Europe/Istanbul' },
  { rorId: '03z9tma90', timeZone: 'Europe/Istanbul' },
  { rorId: '03a5qrr21', timeZone: 'Europe/Istanbul' },
  { rorId: '013sk6x84', timeZone: 'America/New_York' },
  { rorId: '02jx3x895', timeZone: 'Europe/London' },
  { rorId: '00zdnkx70', timeZone: 'Asia/Taipei' },
  { rorId: '005tw0h26', timeZone: 'Europe/Belgrade' },
  { rorId: '04p94ax69', timeZone: 'Europe/Paris' },
  { rorId: '03m6ee736', timeZone: 'America/New_York' },
] as const

/** The zone a fake job's deadline ends in once stored: its own, or else its institution's. */
export function storedZone(
  job: Pick<FakeJob, 'deadlineKind' | 'deadlineTz' | 'institutionRorId'>,
): string | null {
  if (job.deadlineKind !== 'fixed') return null
  if (job.deadlineTz !== undefined) return job.deadlineTz
  return FAKE_INSTITUTIONS.find(({ rorId }) => rorId === job.institutionRorId)?.timeZone ?? null
}

/** A site away from the institution, for the first random job at these institutions. */
const LOCATION_OVERRIDES: Record<string, { city: string; country?: string }> = {
  '056d84691': { city: 'Solna' },
  '03gnh5541': { city: 'Vienna', country: 'AT' },
  '053sba816': { city: 'Arnhem' },
}

/** Generic research topics per subfield. */
const TOPICS: Record<string, string[]> = {
  'molecular-cellular': ['neuronal cell biology', 'axonal transport', 'neuronal metabolism'],
  'synapses-plasticity': ['synaptic plasticity', 'presynaptic release', 'dendritic integration'],
  glia: ['astrocyte signalling', 'microglia in development', 'myelin plasticity'],
  neurogenetics: ['the genetics of neurodevelopment', 'gene regulation in neurons'],
  developmental: ['cortical development', 'neural stem cells', 'axon guidance'],
  'systems-circuits': [
    'cortical circuit dynamics',
    'hippocampal circuits',
    'thalamocortical loops',
  ],
  sensory: ['visual processing', 'auditory coding', 'touch and pain pathways'],
  motor: ['motor control', 'motor learning', 'spinal circuits'],
  cognitive: ['working memory', 'decision making', 'attention'],
  'affective-social': ['social behaviour', 'stress and emotion', 'reward processing'],
  behavioral: ['sleep and circadian rhythms', 'navigation behaviour', 'foraging decisions'],
  'computational-theoretical': ['models of learning', 'neural population coding'],
  'integrative-physiology': ['brain–body interactions', 'neuroendocrine regulation'],
  neuroimmunology: ['neuroinflammation', 'immune signals in the brain'],
  neuropharmacology: ['the pharmacology of pain', 'receptor pharmacology'],
  'clinical-translational': ['biomarkers of neurodegeneration', 'epilepsy', 'stroke recovery'],
  'neurotechnology-bci': ['brain–computer interfaces', 'neural implants', 'wearable EEG'],
  'evolutionary-comparative': ['comparative neuroanatomy', 'the evolution of nervous systems'],
}

const TITLES: Record<string, string[]> = {
  msc: ['MSc thesis project on {topic}', 'MSc internship in {topic}'],
  phd: ['PhD position in {topic}', 'Doctoral researcher in {topic}', 'PhD studentship: {topic}'],
  postdoc: [
    'Postdoctoral researcher in {topic}',
    'Postdoc position: {topic}',
    'Research fellow in {topic}',
  ],
  'research-staff': [
    'Research technician for {topic}',
    'Laboratory manager, {topic}',
    'Data scientist for research on {topic}',
  ],
  'faculty-pi': ['Assistant professor in {topic}', 'Group leader in {topic}'],
  industry: ['Research scientist, {topic}', 'Application scientist for {topic}'],
}

const CAREER_STAGES: Record<string, string[]> = {
  msc: ['student'],
  phd: ['phd-candidate'],
  postdoc: ['early-postdoc', 'postdoc'],
  'research-staff': ['research-staff'],
  'faculty-pi': ['independent'],
  industry: ['industry-professional', 'postdoc'],
}

const OPENINGS: Record<string, string[]> = {
  msc: ['A six-month thesis project', 'A one-year research project'],
  phd: ['A three-year doctoral project', 'A fully funded four-year doctoral project'],
  postdoc: ['A two-year postdoctoral position', 'A three-year postdoctoral position'],
  'research-staff': ['A permanent staff position', 'A fixed-term staff position'],
  'faculty-pi': ['A tenure-track position', 'An independent group leader position'],
  industry: ['A full-time industry role', 'A permanent research role'],
}

const METHODS: Record<string, string> = {
  electrophysiology: 'electrophysiology',
  'optical-imaging': 'optical imaging',
  'mri-fmri': 'MRI',
  'eeg-meg': 'EEG',
  'opto-chemogenetics': 'optogenetics',
  'single-cell-spatial': 'single-cell sequencing',
  'behavioral-assays': 'behavioural experiments',
  'computational-modeling': 'computational modelling',
  'machine-learning': 'machine learning',
  'statistics-data-science': 'statistical analysis',
}

const MODELS: Record<string, string> = {
  mouse: 'in mice',
  rat: 'in rats',
  zebrafish: 'in zebrafish',
  drosophila: 'in fruit flies',
  human: 'with human volunteers',
  'ipsc-organoids': 'in human organoids',
  'in-silico': 'in simulations',
}

const CLOSINGS = [
  'The group is part of an interdisciplinary research programme.',
  'Applicants from biology, physics, engineering or computer science are welcome.',
  'Training in open and reproducible research is part of the position.',
  'The working language of the team is English.',
]

const STARTS = [null, 'As soon as possible', 'January 2027', 'Spring 2027', 'By agreement']

const SHORT_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** A small seeded random generator (mulberry32): the same seed gives the same numbers. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fake job, with terms named by slug and institutions by ROR ID. */
export type FakeJob = {
  shortId: string
  title: string
  institutionRorId: string
  locationOverride?: { city: string; country?: string }
  status: 'draft' | 'in_review' | 'published' | 'expired' | 'withdrawn'
  deadlineKind: 'fixed' | 'rolling' | 'until-filled'
  /** Stored form of the deadline day (noon UTC). */
  deadlineDate: string | null
  /**
   * The deadline's time zone; null when it is unknown (Anywhere on Earth). Undefined leaves it out,
   * so the collection gives the job its institution's zone, as for a job made from a candidate.
   */
  deadlineTz?: string | null
  positionType: string
  subfields: string[]
  methods: string[]
  modelSystems: string[]
  careerStages: string[]
  summary: string
  originalUrl: string
  startText: string | null
  verifiedAt: string | null
  checks: Record<
    'employerOrigin' | 'positionOpen' | 'deadlineConfirmed' | 'ownWords' | 'noPersonalContacts',
    boolean
  >
  publishedAt: string | null
  expiredAt: string | null
  withdrawnAt: string | null
}

const allChecks = (value: boolean) => ({
  employerOrigin: value,
  positionOpen: value,
  deadlineConfirmed: value,
  ownWords: value,
  noPersonalContacts: value,
})

type Random = ReturnType<typeof seededRandom>

const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T
const between = (random: Random, min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1))
const some = <T>(random: Random, items: readonly T[], min: number, max: number): T[] => {
  const pool = [...items]
  const result: T[] = []
  for (let n = between(random, min, max); n > 0 && pool.length > 0; n--) {
    result.push(pool.splice(Math.floor(random() * pool.length), 1)[0] as T)
  }
  return result
}

function summaryOf(
  random: Random,
  positionType: string,
  topic: string,
  methods: string[],
  models: string[],
) {
  const using = methods.length > 0 ? ` using ${methods.map((m) => METHODS[m]).join(' and ')}` : ''
  const model = models.map((m) => MODELS[m]).find(Boolean)
  const first = `${pick(random, OPENINGS[positionType] ?? ['A position'])} on ${topic}${using}${model ? ` ${model}` : ''}.`
  const summary = `${first} ${pick(random, CLOSINGS)}`
  return summary.length <= 280 ? summary : first
}

const iso = (ms: number) => new Date(ms).toISOString()

/** The dates and status fields of a job, from its deadline and status. */
function lifecycle(
  job: Pick<FakeJob, 'status' | 'deadlineKind'> & { day: string | null; timeZone: string | null },
  now: number,
  random: Random,
) {
  const end = job.day ? deadlineEnd(job.day, job.timeZone).getTime() : null
  const times = { publishedAt: null as string | null, expiredAt: null as string | null }
  let withdrawnAt: string | null = null
  if (job.status === 'expired') {
    const closed = end ?? now - between(random, 1, 20) * DAY_MS
    times.publishedAt = iso(closed - between(random, 20, 60) * DAY_MS)
    // The hourly check marks a job as expired soon after its deadline day ends.
    times.expiredAt = iso(closed + between(random, 5, 55) * MINUTE_MS)
  } else if (job.status === 'published' || job.status === 'withdrawn') {
    times.publishedAt = iso(now - between(random, 5, 40) * DAY_MS)
    if (job.status === 'withdrawn') withdrawnAt = iso(now - 3 * DAY_MS)
  }
  const verifiedAt = times.publishedAt
    ? storedDay(calendarDay(times.publishedAt) as string)
    : job.status === 'in_review'
      ? storedDay(calendarDay(new Date(now)) as string)
      : null
  return { ...times, withdrawnAt, verifiedAt }
}

const facts = (job: FakeJob): DedupeFacts => ({
  canonicalUrl: job.originalUrl,
  institution: job.institutionRorId,
  deadlineKind: job.deadlineKind,
  deadlineDay: calendarDay(job.deadlineDate),
  fingerprint: normaliseTitle(job.title),
})

/** All fake jobs for a run at `now`: the fixed ones first, then the random ones. */
export function fakeJobs(now: Date, seed = SEED): FakeJob[] {
  const random = seededRandom(seed)
  const nowMs = now.getTime()
  const today = calendarDay(now) as string
  const jobs: FakeJob[] = []
  const shortIds = new Set<string>()

  for (const fixed of Object.values(FIXED_JOBS) as FixedJob[]) {
    const day = fixed.deadlineKind === 'fixed' ? addDays(today, fixed.deadlineInDays ?? 0) : null
    const timeZone = fixed.deadlineTz ?? null
    const topic = fixed.title.replace(/^.* (in|on|for) /, '')
    const methods = [...(fixed.methods ?? [])]
    const modelSystems = [...(fixed.modelSystems ?? [])]
    jobs.push({
      shortId: fixed.shortId,
      title: fixed.title,
      institutionRorId: fixed.institutionRorId,
      status: fixed.status,
      deadlineKind: fixed.deadlineKind,
      deadlineDate: day ? storedDay(day) : null,
      deadlineTz: timeZone,
      positionType: fixed.positionType,
      subfields: [...fixed.subfields],
      methods,
      modelSystems,
      careerStages: [...(fixed.careerStages ?? [])],
      summary: summaryOf(random, fixed.positionType, topic, methods, modelSystems),
      originalUrl: postingUrl(fixed.institutionRorId, fixed.shortId),
      startText: 'By agreement',
      checks: allChecks(fixed.status !== 'draft'),
      ...lifecycle({ ...fixed, day, timeZone }, nowMs, random),
    })
    shortIds.add(fixed.shortId)
  }

  const overridden = new Set<string>()
  while (jobs.length < Object.keys(FIXED_JOBS).length + RANDOM_JOBS) {
    let shortId: string
    do {
      shortId = Array.from({ length: 5 }, () => pick(random, [...SHORT_ID_ALPHABET])).join('')
    } while (shortIds.has(shortId) || shortId.startsWith('test'))

    const institution = pick(random, FAKE_INSTITUTIONS)
    const positionType = pick(random, Object.keys(TITLES))
    const subfields = some(random, Object.keys(TOPICS), 1, 2)
    const methods = some(random, Object.keys(METHODS), 0, 2)
    const modelSystems = some(random, Object.keys(MODELS), 0, 1)
    const kindRoll = random()
    const deadlineKind = kindRoll < 0.1 ? 'rolling' : kindRoll < 0.2 ? 'until-filled' : 'fixed'
    const day = deadlineKind === 'fixed' ? addDays(today, between(random, -45, 150)) : null
    // Most take their institution's zone from the collection (D40); a few have an unknown zone,
    // as when an editor empties the field. (Drawn only for fixed deadlines, as it always was, so
    // the other values stay the same.)
    const unknownZone = day ? random() < 0.1 : true
    const timeZone = day && !unknownZone ? institution.timeZone : null
    const ended = day ? deadlineEnd(day, timeZone).getTime() <= nowMs : random() < 0.15
    const statusRoll = random()
    const status = ended
      ? 'expired'
      : statusRoll < 0.08
        ? 'draft'
        : statusRoll < 0.16
          ? 'in_review'
          : 'published'
    const topic = pick(random, TOPICS[subfields[0] as string] as string[])
    const job: FakeJob = {
      shortId,
      title: pick(random, TITLES[positionType] as string[]).replace('{topic}', topic),
      institutionRorId: institution.rorId,
      status,
      deadlineKind,
      deadlineDate: day ? storedDay(day) : null,
      deadlineTz: unknownZone ? null : undefined,
      positionType,
      subfields,
      methods,
      modelSystems,
      careerStages: some(random, CAREER_STAGES[positionType] as string[], 1, 2),
      summary: summaryOf(random, positionType, topic, methods, modelSystems),
      originalUrl: postingUrl(institution.rorId, shortId),
      startText: pick(random, STARTS),
      checks: allChecks(status !== 'draft' && status !== 'in_review'),
      ...lifecycle({ status, deadlineKind, day, timeZone }, nowMs, random),
    }
    // Two fake jobs that look like the same position would trip the duplicate warning.
    if (jobs.some((other) => likelyDuplicate(facts(job), facts(other)))) continue
    if (LOCATION_OVERRIDES[institution.rorId] && !overridden.has(institution.rorId)) {
      job.locationOverride = LOCATION_OVERRIDES[institution.rorId]
      overridden.add(institution.rorId)
    }
    jobs.push(job)
    shortIds.add(shortId)
  }
  return jobs
}
