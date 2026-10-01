import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'

import { HomeDigest } from '@/components/home/HomeDigest'
import { HomeFigures } from '@/components/home/HomeFigures'
import { HomeHero } from '@/components/home/HomeHero'
import { HomeLists } from '@/components/home/HomeLists'
import { HomeNextLab } from '@/components/home/HomeNextLab'
import { HomeWindows } from '@/components/home/HomeWindows'
import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/JsonLd'
import { errorSummary } from '@/lib/errors'
import { homeData } from '@/lib/home'
import { requestTime } from '@/lib/records'

// The home page (PLAN §3.2 "Home", §9.1, §9.2; M6). English only (PLAN §12). The figures and lists
// come from the database, kept for up to 10 minutes (src/lib/home.ts); if the database cannot be
// read, the page still has its hero, its ways in and the digest, without them.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { alternates: { canonical: '/en/' } }

export default async function HomePage() {
  setRequestLocale('en')
  const now = requestTime()
  const data = await homeData(now).catch((error: unknown) => {
    // Class and code only: a failed query's message can quote its parameters.
    console.error('Home page data failed:', errorSummary(error))
    return null
  })

  return (
    <main id="main" className="home flex-1">
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      <HomeHero data={data} />
      {data && <HomeFigures data={data} />}
      <HomeDigest variant="short" />
      {data && <HomeLists data={data} now={now} />}
      {data && <HomeNextLab data={data} />}
      {data && <HomeWindows data={data} />}
      <HomeDigest variant="full" />
    </main>
  )
}
