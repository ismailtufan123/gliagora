import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { DataRequestForm } from '@/components/data-requests/DataRequestForm'
import type { FormAction } from '@/components/forms/usePublicForm'
import { DATA_REQUEST_KINDS } from '@/lib/data-requests/kinds'
import { DATA_REQUEST_PATHS, REQUEST_FORM_ID } from '@/lib/data-requests/paths'
import { canSendEmail } from '@/lib/email/settings'
import { altchaKey } from '@/lib/forms/altcha'
import { DATA_REQUEST_LEGAL_LINKS, emptyDataRequestValues } from '@/lib/forms/data-request'
import type { DataRequestValues } from '@/lib/forms/data-request-schema'
import { initialFormState } from '@/lib/forms/public-form'
import { linkInStage } from '@/lib/m2-links'
import { appOrigin } from '@/lib/members/origin'
import type { SiteStage } from '@/lib/site-stage'
import { PRIVACY_EMAIL } from '@/lib/site'

// The data-request form's section at the end of the data-requests page (M4b, D49; the M4b design
// §5, §7.8), which the text links to (`#request-form`). Read for each request: each page gets its
// own spam-check challenge. Without a mail server, the spam check or a known origin, it says the
// form is temporarily unavailable and gives the address to write to instead. `action` is the
// page's Server Action (sendDataRequest), shared by the page and its M2 version, where its links to
// the privacy policy keep only their words while that text is not public (`stage="m2"`, D41, D50).
export async function DataRequestSection({
  action,
  stage = 'private',
}: {
  action: FormAction<DataRequestValues>
  stage?: SiteStage
}) {
  const t = await getTranslations({ locale: 'en', namespace: 'dataRequest' })
  const email = (chunks: ReactNode) => <a href={`mailto:${PRIVACY_EMAIL}`}>{chunks}</a>
  const legal = (href: string) => {
    const to = linkInStage(href, stage)
    return function LegalLink(chunks: ReactNode) {
      return to === null ? chunks : <a href={to}>{chunks}</a>
    }
  }
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
          action={action}
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
              link: legal(DATA_REQUEST_LEGAL_LINKS.spamProtection),
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
          link: legal(DATA_REQUEST_LEGAL_LINKS.privacy),
        })}
      </p>
      <div className="mt-4">{form}</div>
    </section>
  )
}
