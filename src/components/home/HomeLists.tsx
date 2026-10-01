import { getTranslations } from 'next-intl/server'

import { JobList } from '@/components/jobs/JobList'
import { jobsHref } from '@/lib/filters/jobs'
import type { HomeData } from '@/lib/home'

// "Latest positions" and "Deadlines coming up" side by side (PLAN §9.1): six rows each, four on
// phones (global.css), in the jobs list's rows without their tags and posting links.

export async function HomeLists({ data, now }: { data: HomeData; now: Date }) {
  const t = await getTranslations({ locale: 'en', namespace: 'home' })
  const lists = [
    { key: 'latest', jobs: data.latest, href: jobsHref({ sort: 'newest' }) },
    { key: 'deadlines', jobs: data.deadlines, href: jobsHref() },
  ] as const
  return (
    <div className="home-lists page-frame">
      {lists.map(({ key, jobs, href }) => (
        <section key={key} aria-labelledby={`home-${key}-title`}>
          <h2 id={`home-${key}-title`} className="text-h3">
            {t(`${key}.title`)}
          </h2>
          {jobs.length > 0 ? (
            <JobList jobs={jobs} now={now} locale="en" headingLevel={3} compact brief />
          ) : (
            <p className="text-text-muted">{t(`${key}.empty`)}</p>
          )}
          <p>
            <a href={href}>{t(`${key}.all`)}</a>
          </p>
        </section>
      ))}
    </div>
  )
}
