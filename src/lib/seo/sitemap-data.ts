import config from '@payload-config'
import { getPayload } from 'payload'

import { openJobsWhere } from '@/lib/jobs/query'
import { subfieldsForIndexing } from '@/lib/records'

import type { SitemapEntry, SitemapType } from './sitemap'
import {
  type SitemapJob,
  institutionEntries,
  jobEntries,
  openJobsPer,
  pageEntries,
  subfieldEntries,
} from './sitemap-entries'

// The database side of the sitemaps: small queries through Payload's local API, each run at most
// once per request, however many types it serves (the index needs all four).

const once = <T>(read: () => Promise<T>) => {
  let result: Promise<T> | undefined
  return () => (result ??= read())
}

/** Reads the entries of each sitemap type at `now`, the moment of the request. */
export function sitemapSource(now: Date): Record<SitemapType, () => Promise<SitemapEntry[]>> {
  // Every open job, with only what the sitemaps need: its address and state, when it changed and
  // its institution. In ID order, so files split at 50,000 keep their jobs in place.
  const openJobs = once(async (): Promise<SitemapJob[]> => {
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'jobs',
      where: openJobsWhere(now),
      select: {
        slug: true,
        shortId: true,
        status: true,
        deadlineKind: true,
        deadlineAt: true,
        expiredAt: true,
        withdrawnAt: true,
        updatedAt: true,
        institution: true,
      },
      sort: 'id',
      depth: 0,
      pagination: false,
    })
    return docs as SitemapJob[]
  })
  const subfields = once(() => subfieldsForIndexing())

  return {
    pages: async () => pageEntries(await subfields()),
    jobs: async () => jobEntries(await openJobs(), now),
    institutions: async () => {
      const perInstitution = openJobsPer(await openJobs(), now, (job) => [job.institution])
      if (perInstitution.size === 0) return []
      const payload = await getPayload({ config })
      const { docs } = await payload.find({
        collection: 'institutions',
        where: { id: { in: [...perInstitution.keys()] } },
        select: { slug: true, rorId: true, shortId: true },
        sort: 'id',
        depth: 0,
        pagination: false,
      })
      return institutionEntries(docs, perInstitution)
    },
    subfields: async () => subfieldEntries(await subfields()),
  }
}
