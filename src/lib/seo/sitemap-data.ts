import config from '@payload-config'
import { getPayload } from 'payload'

import { openJobsWhere } from '@/lib/jobs/query'
import { subfieldsForIndexing } from '@/lib/records'
import { type SiteStage, siteStage } from '@/lib/site-stage'

import type { SitemapEntry, SitemapType } from './sitemap'
import {
  type SitemapJob,
  institutionEntries,
  jobEntries,
  m2PageEntries,
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

/**
 * Reads the entries of each sitemap type at `now`, the moment of the request. In the M2 state
 * (D41, D50) only its public pages that are indexed: the positions, institutions and subfields
 * stay private, so their files list nothing and do not exist, and nothing is read.
 */
export function sitemapSource(
  now: Date,
  stage: SiteStage = siteStage(),
): Record<SitemapType, () => Promise<SitemapEntry[]>> {
  if (stage === 'm2') {
    const none = async (): Promise<SitemapEntry[]> => []
    return { pages: async () => m2PageEntries(), jobs: none, institutions: none, subfields: none }
  }
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
  // The sent issues of Glia Notes (M11), for the archive's entries.
  const issues = once(async () => {
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'newsletter-issues',
      where: { status: { equals: 'sent' } },
      select: { month: true, sentAt: true },
      sort: '-sentAt',
      depth: 0,
      pagination: false,
    })
    return docs.flatMap((doc) => (doc.month ? [{ month: doc.month, sentAt: doc.sentAt }] : []))
  })

  return {
    pages: async () => pageEntries(await subfields(), await issues()),
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
