import { getTranslations } from 'next-intl/server'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'

// A member page whose data cannot be read (the database is unreachable): the page's heading and
// "temporarily unavailable", drawn on the server so it shows without JavaScript. A page cannot set
// its status in Next.js, so this answers 200; member pages are dynamic (never stored) and never
// indexed. The log line has a reference, the error's class and code, and nothing about the member.

export async function MemberUnavailable({
  title,
  name,
  error,
}: {
  title: string
  /** Names the page in the log ("Account page"). */
  name: string
  error: unknown
}) {
  const reference = newReference()
  console.error(`${name} failed (reference ${reference}):`, errorSummary(error))
  const t = await getTranslations({ locale: 'en' })
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{title}</h1>
        <p className="notice" role="alert">
          {t('unavailable.text')}
        </p>
      </div>
    </main>
  )
}
