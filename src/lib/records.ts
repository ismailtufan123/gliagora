import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/routing'

// Reads for the pages that show database records. The proxy has already checked that the record
// exists (src/lib/detail-routes.ts); these return null only if it disappeared in between.
// `cache` shares each read between a page and its metadata within one request.

export const activeSubfields = cache(async (locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'terms',
    where: { vocabulary: { equals: 'subfield' }, isActive: { equals: true } },
    sort: 'sortOrder',
    select: { slug: true, label: true, description: true },
    locale,
    pagination: false,
    depth: 0,
  })
  return docs
})

export const subfieldBySlug = cache(async (slug: string, locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'terms',
    where: { vocabulary: { equals: 'subfield' }, slug: { equals: slug } },
    select: { slug: true, label: true, description: true, hubIntro: true, isActive: true },
    locale,
    limit: 1,
    pagination: false,
    depth: 0,
  })
  return docs[0] ?? null
})

/** The institution at the end of an institution URL: a ROR ID (9 characters) or a short ID. */
export const institutionByUrlId = cache(async (id: string, locale: Locale) => {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'institutions',
    where: id.length === 9 ? { rorId: { equals: id } } : { shortId: { equals: id } },
    locale,
    limit: 1,
    pagination: false,
    // Includes the country, for its localized name.
    depth: 1,
  })
  return docs[0] ?? null
})
