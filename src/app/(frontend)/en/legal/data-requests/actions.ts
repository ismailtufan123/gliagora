'use server'

import config from '@payload-config'
import { getTranslations } from 'next-intl/server'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { recordAndSendDataRequest } from '@/lib/data-requests/record'
import { canSendEmail } from '@/lib/email/settings'
import { altchaKey } from '@/lib/forms/altcha'
import {
  DATA_REQUEST_SENT_PATH,
  type DataRequestState,
  handleDataRequest,
} from '@/lib/forms/data-request'
import { stateAfter } from '@/lib/forms/public-form'
import { postgresLimitStore } from '@/lib/forms/rate-limit'
import { appOrigin } from '@/lib/members/origin'

// The Server Action behind the data-request form (M4b, D49; the M4b design §7.8). The checks are
// those of every public form (src/lib/forms/data-request.ts); once they pass, this records the
// request with only its kind, date and address hash, keeps what the person wrote with the
// confirmation link, and emails the link while the person waits (`recordAndSendDataRequest`,
// src/lib/data-requests/record.ts). That email is also the acknowledgement that the request
// arrived. If the mail server does not take it within 20 seconds, the record and the link are
// deleted again and the form says it could not send the email. Every address gets the same answer.

export async function sendDataRequest(
  previous: DataRequestState,
  form: FormData,
): Promise<DataRequestState> {
  const now = new Date()
  const requestHeaders = await headers()
  const origin = appOrigin(requestHeaders)
  const secret = process.env.PAYLOAD_SECRET ?? ''
  // Off without a mail server, the spam check or a known origin: the form then says it is
  // temporarily unavailable, as the page itself does.
  const key = origin && canSendEmail() ? altchaKey() : null
  const outcome = await handleDataRequest(form, {
    altchaKey: key,
    secret,
    headers: requestHeaders,
    now,
    limits: async () => postgresLimitStore(await getPayload({ config })),
    // Without an origin the form is off (no key above), so `save` is never reached then.
    save: async (data) =>
      origin
        ? recordAndSendDataRequest(await getPayload({ config }), data, { origin, secret, now })
        : 'unavailable',
  })
  // Also when the hidden field was filled in: the same answer as for a real request.
  if (outcome.kind === 'sent') {
    // As for the other forms: Back from the sent page then shows the form with a new challenge.
    refresh()
    redirect(DATA_REQUEST_SENT_PATH)
  }

  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest.errors' })
  return stateAfter(outcome, previous, (code, values) => t(code as never, values as never), key)
}
