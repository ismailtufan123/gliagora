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
  }
}
