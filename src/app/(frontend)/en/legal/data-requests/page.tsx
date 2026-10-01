import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ContentPage, contentMetadata } from '@/components/ContentPage'
import { DataRequestForm } from '@/components/data-requests/DataRequestForm'
import { DATA_REQUEST_KINDS } from '@/lib/data-requests/kinds'
import { DATA_REQUEST_PATHS, REQUEST_FORM_ID } from '@/lib/data-requests/paths'
import { canSendEmail } from '@/lib/email/settings'
import { altchaKey } from '@/lib/forms/altcha'
import { DATA_REQUEST_LEGAL_LINKS, emptyDataRequestValues } from '@/lib/forms/data-request'
import { initialFormState } from '@/lib/forms/public-form'
import { appOrigin } from '@/lib/members/origin'
import { PRIVACY_EMAIL } from '@/lib/site'

import { sendDataRequest } from './actions'

// Data requests (PLAN §15.4): the text is in content/en/legal/data-requests.md, and the form under
// it (M4b, D49; the M4b design §5, §7.8), which the text links to (`#request-form`). Rendered for
// each request, because each page gets its own spam-check challenge (the text is read from the
// file then too, which next.config.ts copies into the server's build). Without a mail server, the
// spam check or a known origin, the form says it is temporarily unavailable and gives the address
// to write to instead.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => contentMetadata('dataRequests')

async function RequestForm() {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest' })
  const email = (chunks: ReactNode) => <a href={`mailto:${PRIVACY_EMAIL}`}>{chunks}</a>
  const key = appOrigin(await headers()) && canSendEmail() ? altchaKey() : null

  let form: ReactNode
  if (key) {
    form = (
      <>
        {/* Without JavaScript the spam check cannot run; the server then says so too. */}
        <noscript>
          <p className="notice">{t.rich('noscript', { email })}</p>
        </noscript>
        <DataRequestForm
          action={sendDataRequest}
          initial={await initialFormState(emptyDataRequestValues(), key)}
          permalink={DATA_REQUEST_PATHS.page}
          text={{
            errorTitle: t('errors.title'),
            errorPrefix: t('errors.prefix'),
            email: { label: t('email.label'), hint: t('email.hint') },
            kind: {
              legend: t('kind.legend'),
              options: DATA_REQUEST_KINDS.map(({ value }) => ({
                value,
                label: t(`kind.${value}.label`),
                hint: t(`kind.${value}.hint`),
              })),
            },
            name: { label: t('name.label'), hint: t('name.hint') },
            details: {
              label: t('details.label'),
              hint: t('details.hint'),
              // Filled in by the form as the person types ("{count}" only, no plural forms).
              left: t.raw('details.left') as string,
              over: t.raw('details.over') as string,
            },
            honeypot: t('honeypot'),
            spamNote: t.rich('spamNote', {
              link: (chunks) => <a href={DATA_REQUEST_LEGAL_LINKS.spamProtection}>{chunks}</a>,
            }),
            submit: t('submit'),
            sending: t('sending'),
          }}
        />
      </>
    )
  } else {
    form = <p className="notice">{t.rich('unavailable', { email })}</p>
  }

  return (
    <section
      id={REQUEST_FORM_ID}
      aria-labelledby={`${REQUEST_FORM_ID}-heading`}
      className="mt-12 grid max-w-(--measure) gap-6 border-t border-line pt-12"
    >
      <h2 id={`${REQUEST_FORM_ID}-heading`} className="text-h2">
        {t('heading')}
      </h2>
      <p>{t('intro')}</p>
      <p>
        {t.rich('kept', {
          link: (chunks) => <a href={DATA_REQUEST_LEGAL_LINKS.privacy}>{chunks}</a>,
        })}
      </p>
      <div className="mt-4">{form}</div>
    </section>
  )
}

export default function Page() {
  return <ContentPage pageKey="dataRequests" after={<RequestForm />} />
}
