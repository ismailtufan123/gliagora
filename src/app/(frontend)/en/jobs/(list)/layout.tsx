import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ErrorTextsProvider } from '@/components/jobs/list/ErrorTexts'

// The jobs list only (the route group leaves job pages out): the words its error state needs.
export default async function Layout({ children }: { children: ReactNode }) {
  const t = await getTranslations({ locale: 'en', namespace: 'jobs.error' })
  return (
    <ErrorTextsProvider
      texts={{
        title: t('title'),
        text: t('text'),
        retry: t('retry'),
        // Filled in by the error state, which knows the reference.
        reference: t('reference', { digest: '{digest}' }),
      }}
    >
      {children}
    </ErrorTextsProvider>
  )
}
