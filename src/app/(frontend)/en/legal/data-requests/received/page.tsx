import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { RequestReceived } from '@/components/data-requests/AfterRequest'
import { dataRequestPageIndexed } from '@/lib/indexing'

// After any request other than a deletion is confirmed with the data-request form's link (M4b,
// D49; the M4b design §5, §7.8): it is recorded, and an editor answers it within 30 days of its
// receipt, by email (RequestReceived). Static and the same for everyone. Never indexed.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.received' })
  return {
    title: t('metaTitle'),
    ...(dataRequestPageIndexed() ? {} : { robots: { index: false } }),
  }
}

export default function Page() {
  return <RequestReceived />
}
