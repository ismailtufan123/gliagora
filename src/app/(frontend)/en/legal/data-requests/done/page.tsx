import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { DeletionDone } from '@/components/data-requests/AfterRequest'
import { dataRequestPageIndexed } from '@/lib/indexing'

// After a deletion confirmed with the data-request form's link (M4b, D49; the M4b design §5,
// §7.8): what was deleted, what stays, and that one email confirms it (DeletionDone). Static and
// the same for everyone. Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.done' })
  return {
    title: t('metaTitle'),
    ...(dataRequestPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default function Page() {
  return <DeletionDone />
}
