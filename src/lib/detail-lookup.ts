import config from '@payload-config'
import { getPayload } from 'payload'

import type { DetailLookup } from './detail-routes'

// The database side of src/lib/detail-routes.ts: small indexed queries through Payload's local API
// (the proxy runs in Node.js, and getPayload reuses the app's connection).
export async function detailLookup(): Promise<DetailLookup> {
  const payload = await getPayload({ config })
  return {
    institution: async (id) => {
      const { docs } = await payload.find({
        collection: 'institutions',
        where: id.length === 9 ? { rorId: { equals: id } } : { shortId: { equals: id } },
        select: { slug: true, rorId: true, shortId: true },
        limit: 1,
        depth: 0,
        pagination: false,
      })
      const doc = docs[0]
      const urlId = doc?.rorId ?? doc?.shortId
      return doc && urlId ? { slug: doc.slug, id: urlId } : null
    },
    subfield: async (slug) => {
      const { docs } = await payload.find({
        collection: 'terms',
        where: { vocabulary: { equals: 'subfield' }, slug: { equals: slug } },
        select: { isActive: true },
        limit: 1,
        depth: 0,
        pagination: false,
      })
      return docs[0] ? { isActive: docs[0].isActive !== false } : null
    },
    job: async (shortId) => {
      const { docs } = await payload.find({
        collection: 'jobs',
        where: { shortId: { equals: shortId } },
        select: {
          slug: true,
          shortId: true,
          status: true,
          deadlineKind: true,
          deadlineAt: true,
          expiredAt: true,
          withdrawnAt: true,
        },
        limit: 1,
        depth: 0,
        pagination: false,
      })
      const doc = docs[0]
      // Every saved job has both: the collection sets them when the job is created.
      if (!doc?.slug || !doc.shortId) return null
      return {
        slug: doc.slug,
        shortId: doc.shortId,
        status: doc.status,
        deadlineKind: doc.deadlineKind,
        deadlineAt: doc.deadlineAt,
        expiredAt: doc.expiredAt,
        withdrawnAt: doc.withdrawnAt,
      }
    },
    sentIssue: async (month) => {
      const { totalDocs } = await payload.count({
        collection: 'newsletter-issues',
        where: { month: { equals: month }, status: { equals: 'sent' } },
      })
      return totalDocs > 0
    },
    retiredJob: async (shortId) => {
      const { totalDocs } = await payload.count({
        collection: 'retired-listings',
        where: { kind: { equals: 'job' }, shortId: { equals: shortId } },
      })
      return totalDocs > 0
    },
  }
}
