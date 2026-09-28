'use server'

import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { altchaKey } from '@/lib/forms/altcha'
import { stateAfter } from '@/lib/forms/public-form'
import { postgresLimitStore } from '@/lib/forms/rate-limit'
import { REPORT_SENT_PATH, type ReportState, handleReport, reportRecord } from '@/lib/forms/report'
import { reportItemLookup } from '@/lib/records'

// The Server Action behind "Report a problem" (src/lib/forms/report.ts does the work). With
// JavaScript the form calls it through React; without, the browser posts the form and Next.js
// renders the page again with the state this returns.

export async function sendReport(previous: ReportState, form: FormData): Promise<ReportState> {
  const key = altchaKey()
  const now = new Date()
  const outcome = await handleReport(form, {
    altchaKey: key,
    secret: process.env.PAYLOAD_SECRET ?? '',
    headers: await headers(),
    now,
    limits: async () => postgresLimitStore(await getPayload({ config })),
    // Reports are created only here, through the local API: `create` is refused to everyone else
    // (src/collections/Reports.ts). The item is checked again: only a public job or an existing
    // institution is linked.
    save: async (data) => {
      const payload = await getPayload({ config })
      await payload.create({
        collection: 'reports',
        data: await reportRecord(data, reportItemLookup, now),
        overrideAccess: true,
        depth: 0,
      })
    },
  })
  // Also when the hidden field was filled in: the same answer as for a real report.
  if (outcome.kind === 'sent') {
    // As for "Suggest a listing": Back from the sent page then shows the form with a new
    // challenge, not the router's cached copy with the one just used.
    refresh()
    redirect(REPORT_SENT_PATH)
  }

  const t = await getTranslations({ locale: 'en', namespace: 'report.errors' })
  return stateAfter(outcome, previous, (code, values) => t(code as never, values as never), key)
}
