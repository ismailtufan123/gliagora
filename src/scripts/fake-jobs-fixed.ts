// Fake jobs with known addresses, one for each state the jobs pages must handle. `pnpm fake:jobs`
// (src/scripts/fake-jobs.ts) creates them next to the random ones, so the end-to-end tests of the
// jobs pages can import this file. Days count from the day the script runs. No imports, so
// Playwright can load the file as it is.

export type FixedJob = {
  shortId: string
  title: string
  /** `slugify(title)`, checked by a test. */
  slug: string
  status: 'draft' | 'published' | 'expired' | 'withdrawn'
  deadlineKind: 'fixed' | 'rolling' | 'until-filled'
  /** Days from the run to the deadline day; negative for a deadline in the past. */
  deadlineInDays?: number
  deadlineTz?: string
  /** From the ROR test data that CI loads (tests/fixtures/ror). */
  institutionRorId: string
  positionType: string
  subfields: string[]
  methods?: string[]
  modelSystems?: string[]
  careerStages?: string[]
}

export const jobPath = (job: Pick<FixedJob, 'slug' | 'shortId'>) =>
  `/en/jobs/${job.slug}-${job.shortId}/`

export const FIXED_JOBS = {
  /** Open, closing in 60 days. */
  open: {
    shortId: 'test1',
    title: 'PhD position in astrocyte–neuron signalling',
    slug: 'phd-position-in-astrocyte-neuron-signalling',
    status: 'published',
    deadlineKind: 'fixed',
    deadlineInDays: 60,
    deadlineTz: 'Europe/Stockholm',
    institutionRorId: '056d84691',
    positionType: 'phd',
    subfields: ['glia', 'molecular-cellular'],
    methods: ['optical-imaging'],
    modelSystems: ['mouse'],
    careerStages: ['phd-candidate'],
  },
  /** Open, closing within 14 days ("Closing soon"). */
  closingSoon: {
    shortId: 'test2',
    title: 'Postdoctoral researcher in cortical circuit imaging',
    slug: 'postdoctoral-researcher-in-cortical-circuit-imaging',
    status: 'published',
    deadlineKind: 'fixed',
    deadlineInDays: 7,
    deadlineTz: 'Europe/Berlin',
    institutionRorId: '02h1nk258',
    positionType: 'postdoc',
    subfields: ['systems-circuits'],
    methods: ['optical-imaging', 'electrophysiology'],
    modelSystems: ['mouse'],
    careerStages: ['early-postdoc'],
  },
  /** Open, with a rolling deadline. */
  rolling: {
    shortId: 'test3',
    title: 'Research engineer for neural data pipelines',
    slug: 'research-engineer-for-neural-data-pipelines',
    status: 'published',
    deadlineKind: 'rolling',
    institutionRorId: '03cpe7c52',
    positionType: 'research-staff',
    subfields: ['computational-theoretical'],
    methods: ['neuroinformatics', 'statistics-data-science'],
    careerStages: ['research-staff'],
  },
  /** Closed 10 days ago: shown with the closed notice. */
  expiredRecently: {
    shortId: 'test4',
    title: 'MSc thesis project in synaptic plasticity',
    slug: 'msc-thesis-project-in-synaptic-plasticity',
    status: 'expired',
    deadlineKind: 'fixed',
    deadlineInDays: -10,
    institutionRorId: '053sba816',
    positionType: 'msc',
    subfields: ['synapses-plasticity'],
    methods: ['electrophysiology'],
    modelSystems: ['rat'],
    careerStages: ['student'],
  },
  /** Closed 45 days ago: answers 410 Gone. */
  expiredLongAgo: {
    shortId: 'test5',
    title: 'PhD position in computational models of memory',
    slug: 'phd-position-in-computational-models-of-memory',
    status: 'expired',
    deadlineKind: 'fixed',
    deadlineInDays: -45,
    deadlineTz: 'Europe/London',
    institutionRorId: '02jx3x895',
    positionType: 'phd',
    subfields: ['computational-theoretical', 'cognitive'],
    methods: ['computational-modeling'],
    modelSystems: ['in-silico'],
    careerStages: ['phd-candidate'],
  },
  /** Withdrawn 3 days ago: answers 410 Gone. */
  withdrawn: {
    shortId: 'test6',
    title: 'Laboratory technician in cellular neuroscience',
    slug: 'laboratory-technician-in-cellular-neuroscience',
    status: 'withdrawn',
    deadlineKind: 'fixed',
    deadlineInDays: 30,
    deadlineTz: 'Europe/Istanbul',
    institutionRorId: '03z9tma90',
    positionType: 'research-staff',
    subfields: ['molecular-cellular'],
    methods: ['anatomy-histology'],
    modelSystems: ['cell-culture'],
    careerStages: ['research-staff'],
  },
  /** Never published: its address is unknown (404). */
  draft: {
    shortId: 'test7',
    title: 'Group leader in developmental neurobiology',
    slug: 'group-leader-in-developmental-neurobiology',
    status: 'draft',
    deadlineKind: 'fixed',
    deadlineInDays: 90,
    institutionRorId: '03g001n57',
    positionType: 'faculty-pi',
    subfields: ['developmental'],
    careerStages: ['independent'],
  },
} as const satisfies Record<string, FixedJob>
