import { getTranslations } from 'next-intl/server'

import { errorSummary } from '@/lib/errors'
import { parseJobFilters } from '@/lib/filters/jobs'
import { MAP_DATA_MAX_AGE_S, type MapTexts, mapJson, mapQuery } from '@/lib/map/data'
import { mapInstitutions } from '@/lib/records'
import { unavailableResponse } from '@/lib/unavailable'

// /api/map/institutions/?{filters} (PLAN §14): the institutions with open positions that match the
// jobs list's filters, as GeoJSON for the map (src/lib/map/data.ts). Public by design, like the
// pages that show the same positions; while the site is private, Caddy asks for the site-wide
// password here too (deploy/Caddyfile, D39). Each filter combination is read from the database at
// most once every 10 minutes: answers are kept here, and browsers keep them as long.
export const dynamic = 'force-dynamic'

const MAX_ANSWERS = 200
const answers = new Map<string, { at: number; body: string }>()

export async function GET(request: Request) {
  const filters = parseJobFilters(new URL(request.url).searchParams)
  const key = mapQuery(filters)
  const now = Date.now()
  const kept = answers.get(key)
  let body = kept && now - kept.at < MAP_DATA_MAX_AGE_S * 1000 ? kept.body : null
  if (!body) {
    try {
      const t = await getTranslations({ locale: 'en', namespace: 'jobs' })
      const texts: MapTexts = {
        place: (city, country) => t('place', { city, country }),
        closes: (date) => t('closes', { date }),
        daysLeft: (days) => t('daysLeft', { days }),
        lastDay: t('lastDay'),
        closed: t('closed'),
        rolling: t('rolling'),
        untilFilled: t('untilFilled'),
      }
      const data = await mapInstitutions(filters, 'en')
      body = JSON.stringify(mapJson(data, filters, new Date(now), 'en', texts))
    } catch (error) {
      // Class and code only: a failed query's message quotes its parameters (the filters).
      console.error('Map data failed:', errorSummary(error))
      return unavailableResponse()
    }
    // The newest answers stay; the oldest go first.
    answers.delete(key)
    answers.set(key, { at: now, body })
    if (answers.size > MAX_ANSWERS) answers.delete(answers.keys().next().value as string)
  }
  return new Response(body, {
    headers: {
      'Content-Type': 'application/geo+json; charset=utf-8',
      // Private while the site is behind the password (D39); public from the launch (M6).
      'Cache-Control': `private, max-age=${MAP_DATA_MAX_AGE_S}`,
    },
  })
}
