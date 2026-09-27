// Adds fake jobs for local development and CI (D38): pnpm fake:jobs
// About 60 generated jobs over the test institutions, plus the fixed jobs the end-to-end tests
// rely on (src/scripts/fake-jobs-fixed.ts). Earlier fake jobs are removed first, so the script can
// run again at any time. Needs the test institutions: pnpm ror:import tests/fixtures/ror/…-sample.zip
import config from '@payload-config'
import { getPayload } from 'payload'

import { FAKE_DATA } from '@/collections/Jobs'

import { FAKE_INSTITUTIONS, FAKE_NOTE, fakeJobs } from './fake-jobs-data'
import { FIXED_JOBS } from './fake-jobs-fixed'

// PAYLOAD_JOBS_AUTORUN is "true" only on the production server (deploy/compose.prod.yml).
if (process.env.PAYLOAD_JOBS_AUTORUN === 'true') {
  console.error(
    'pnpm fake:jobs adds fake jobs for local development and CI only. It does not run where PAYLOAD_JOBS_AUTORUN is "true", which marks the production server.',
  )
  process.exit(1)
}

const payload = await getPayload({ config })
// Lets the jobs collection accept back-dated status timestamps and delete published fake jobs.
const context = { fakeData: FAKE_DATA }

try {
  const removed = await payload.delete({
    collection: 'jobs',
    where: { internalNotes: { equals: FAKE_NOTE } },
    depth: 0,
    context,
  })
  if (removed.errors.length > 0) {
    throw new Error(`Could not remove earlier fake jobs: ${removed.errors[0]?.message}`)
  }

  const rorIds = [
    ...new Set([
      ...FAKE_INSTITUTIONS.map(({ rorId }) => rorId),
      ...Object.values(FIXED_JOBS).map((job) => job.institutionRorId),
    ]),
  ]
  const institutions = await payload.find({
    collection: 'institutions',
    where: { rorId: { in: rorIds } },
    select: { rorId: true },
    depth: 0,
    pagination: false,
  })
  const institutionId = new Map(institutions.docs.map((doc) => [doc.rorId, doc.id]))
  const missing = rorIds.filter((rorId) => !institutionId.has(rorId))
  if (missing.length > 0) {
    throw new Error(
      `Test institutions are missing (${missing.join(', ')}). Load them first: pnpm ror:import tests/fixtures/ror/v2.13-2026-09-22-ror-data-sample.zip`,
    )
  }

  const terms = await payload.find({
    collection: 'terms',
    where: {
      vocabulary: {
        in: ['position-type', 'career-stage', 'subfield', 'method', 'model-system'],
      },
    },
    select: { vocabulary: true, slug: true },
    depth: 0,
    pagination: false,
  })
  const termId = new Map(terms.docs.map((term) => [`${term.vocabulary}/${term.slug}`, term.id]))
  const ids = (vocabulary: string, slugs: string[]) =>
    slugs.map((slug) => {
      const id = termId.get(`${vocabulary}/${slug}`)
      if (id === undefined) throw new Error(`Unknown ${vocabulary} term: ${slug}`)
      return id
    })

  const jobs = fakeJobs(new Date())
  const counts: Record<string, number> = {}
  for (const { institutionRorId, ...job } of jobs) {
    await payload.create({
      collection: 'jobs',
      data: {
        ...job,
        institution: institutionId.get(institutionRorId) as number,
        positionType: ids('position-type', [job.positionType])[0],
        careerStages: ids('career-stage', job.careerStages),
        subfields: ids('subfield', job.subfields),
        methods: ids('method', job.methods),
        modelSystems: ids('model-system', job.modelSystems),
        deadlineTz: job.deadlineTz as never,
        originalLanguage: 'en',
        linkStatus: 'unchecked',
        internalNotes: FAKE_NOTE,
      },
      depth: 0,
      context,
    })
    counts[job.status] = (counts[job.status] ?? 0) + 1
  }
  payload.logger.info(
    `Removed ${removed.docs.length} and added ${jobs.length} fake jobs: ${Object.entries(counts)
      .map(([status, n]) => `${n} ${status}`)
      .join(', ')}`,
  )
  process.exit(0)
} catch (error) {
  payload.logger.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
