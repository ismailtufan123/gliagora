// Adds fake jobs for local development and CI (D38): pnpm fake:jobs
// About 60 generated jobs over the test institutions, plus the fixed jobs the end-to-end tests
// rely on (src/scripts/fake-jobs-fixed.ts) and the address of one retired job, then a handful of
// suggestions, candidates and reports for the review queue (src/scripts/fake-queue-data.ts).
// Earlier fake data is removed first, so the script can run again at any time. Needs the test
// institutions: pnpm ror:import tests/fixtures/ror/…-sample.zip
import config from '@payload-config'
import { getPayload } from 'payload'

import { FAKE_DATA } from '@/collections/Jobs'

import { FAKE_INSTITUTIONS, FAKE_NOTE, fakeJobs } from './fake-jobs-data'
import { FIXED_JOBS, RETIRED_JOB } from './fake-jobs-fixed'
import { addFakeQueue, removeFakeQueue } from './fake-queue'
import { FAKE_QUEUE_INSTITUTIONS } from './fake-queue-data'

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
  // The queue first: its candidates refer to the fake jobs.
  const removedQueue = await removeFakeQueue(payload)
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
      ...FAKE_QUEUE_INSTITUTIONS,
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
  const jobId = new Map<string, number>()
  for (const { institutionRorId, deadlineTz, ...job } of jobs) {
    const created = await payload.create({
      collection: 'jobs',
      data: {
        ...job,
        // Left out, the job takes its institution's zone (D40); null keeps it unknown (AoE).
        ...(deadlineTz === undefined ? {} : { deadlineTz: deadlineTz as never }),
        institution: institutionId.get(institutionRorId) as number,
        positionType: ids('position-type', [job.positionType])[0],
        careerStages: ids('career-stage', job.careerStages),
        subfields: ids('subfield', job.subfields),
        methods: ids('method', job.methods),
        modelSystems: ids('model-system', job.modelSystems),
        originalLanguage: 'en',
        linkStatus: 'unchecked',
        internalNotes: FAKE_NOTE,
      },
      depth: 0,
      context,
    })
    jobId.set(job.shortId, created.id)
    counts[job.status] = (counts[job.status] ?? 0) + 1
  }
  // The retired job the end-to-end tests expect to answer 410: added once, never removed.
  const retired = await payload.count({
    collection: 'retired-listings',
    where: { shortId: { equals: RETIRED_JOB.shortId } },
  })
  if (retired.totalDocs === 0) {
    await payload.create({
      collection: 'retired-listings',
      data: { kind: 'job', ...RETIRED_JOB, retiredAt: new Date().toISOString() },
      depth: 0,
    })
  }
  const queue = await addFakeQueue(payload, {
    institutionId: new Map([...institutionId].map(([rorId, id]) => [String(rorId), id])),
    jobId,
  })
  const byStatus = (numbers: Record<string, number>) =>
    Object.entries(numbers)
      .map(([status, n]) => `${n} ${status}`)
      .join(', ')
  payload.logger.info(
    `Removed ${removed.docs.length} and added ${jobs.length} fake jobs: ${byStatus(counts)}`,
  )
  payload.logger.info(
    `Removed ${removedQueue.submissions} and added ${queue.submissions} fake suggestions; removed ${removedQueue.candidates} and added ${Object.values(queue.candidates).reduce((a, b) => a + b, 0)} fake candidates: ${byStatus(queue.candidates)}`,
  )
  payload.logger.info(
    `Removed ${removedQueue.reports} and added ${queue.reports} fake reports (with those the end-to-end tests sent)`,
  )
  process.exit(0)
} catch (error) {
  payload.logger.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
