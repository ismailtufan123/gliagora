// What job pages, job rows and the issues of Glia Notes read of a job (src/lib/records.ts,
// src/lib/newsletter/issue/build.ts), in one place, without importing Payload's config.

// What job pages and job rows read: public facts only, never internal notes, the checklist or
// the duplicate check. Relationships are read one level deep, with only the fields shown.
export const JOB_CARD_SELECT = {
  title: true,
  slug: true,
  shortId: true,
  status: true,
  originalLanguage: true,
  institution: true,
  city: true,
  country: true,
  positionType: true,
  subfields: true,
  methods: true,
  modelSystems: true,
  deadlineKind: true,
  deadlineDate: true,
  deadlineTz: true,
  deadlineAt: true,
  expiredAt: true,
  withdrawnAt: true,
  originalUrl: true,
} as const

export const JOB_DETAIL_SELECT = {
  ...JOB_CARD_SELECT,
  careerStages: true,
  startText: true,
  summary: true,
  verifiedAt: true,
} as const

export const JOB_POPULATE = {
  institutions: { name: true, slug: true, rorId: true, shortId: true },
  // `isActive`: a retired subfield stays on its jobs, but its hub answers 410, so it gets no link.
  terms: { slug: true, label: true, isActive: true },
  countries: { name: true },
} as const
