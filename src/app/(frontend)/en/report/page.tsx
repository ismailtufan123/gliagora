import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ReportForm } from '@/components/report/ReportForm'
import { altchaKey } from '@/lib/forms/altcha'
import { initialFormState } from '@/lib/forms/public-form'
import { REPORT_LEGAL_LINKS, emptyReportValues } from '@/lib/forms/report'
import { textDirection } from '@/lib/jobs/languages'
import { jobForReport, requestTime } from '@/lib/records'
import { ITEM_PARAM, type ReportItem, parseItemRef, reportItem } from '@/lib/reports/item'
import { REPORT_KINDS } from '@/lib/reports/status'
import { CONTACT_EMAIL } from '@/lib/site'

import { sendReport } from './actions'

// "Report a problem" (PLAN §3.2, §7.5, §15.4): the form behind the link on every item, with the
// item filled in from the address (`?item=job:{shortId}`), and the form the notice and takedown
// page links to for corrections, removals and personal-rights requests. Not indexed (PLAN §2.2);
// rendered for each request, because each page gets its own spam-check challenge.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'report' })
  return { title: t('title'), description: t('description'), robots: { index: false } }
}

/** The public item the address names, or null (an unknown or hidden one is simply left out). */
async function itemOf(value: unknown): Promise<ReportItem | null> {
  const ref = parseItemRef(value)
  if (!ref) return null
  try {
    return reportItem(await jobForReport(ref.shortId), requestTime())
  } catch (error) {
    // The form works without its item; storing the report reports the database error itself.
    console.error('Item lookup for a report failed:', error instanceof Error ? error.name : error)
    return null
  }
}

export default async function Page({ searchParams }: Props) {
  setRequestLocale('en')
  const t = await getTranslations({ locale: 'en', namespace: 'report' })
  const email = (chunks: ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>
  const item = await itemOf((await searchParams)[ITEM_PARAM])
  const key = altchaKey()

  let form: ReactNode
  if (key) {
    const initial = await initialFormState(emptyReportValues(item), key)
    form = (
      <>
        {/* Without JavaScript the spam check cannot run; the server then says so too. */}
        <noscript>
          <p className="notice">{t.rich('noscript', { email })}</p>
        </noscript>
        <ReportForm
          action={sendReport}
          initial={initial}
          text={{
            errorTitle: t('errors.title'),
            errorPrefix: t('errors.prefix'),
            kind: {
              legend: t('kind.legend'),
              options: REPORT_KINDS.map(({ value }) => ({
                value,
                label: t(`kind.${value}.label`),
                hint: t(`kind.${value}.hint`),
              })),
            },
            details: {
              label: t('details.label'),
              hint: t('details.hint'),
              // Filled in by the form as the person types ("{count}" only, no plural forms).
              left: t.raw('details.left') as string,
              over: t.raw('details.over') as string,
            },
            email: {
              label: t('email.label'),
              hint: t.rich('email.hint', {
                privacy: (chunks) => <a href={REPORT_LEGAL_LINKS.privacy}>{chunks}</a>,
                kvkk: (chunks) => (
                  <a href={REPORT_LEGAL_LINKS.kvkk} hrefLang="tr">
                    {chunks}
                  </a>
                ),
              }),
            },
            honeypot: t('honeypot'),
            spamNote: t.rich('spamNote', {
              link: (chunks) => <a href={REPORT_LEGAL_LINKS.spamProtection}>{chunks}</a>,
            }),
            submit: t('submit'),
            sending: t('sending'),
          }}
        />
      </>
    )
  } else {
    // ALTCHA_HMAC_KEY is missing: say so instead of showing a form that cannot be sent.
    form = <p className="notice">{t.rich('unavailable', { email })}</p>
  }

  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="grid max-w-(--measure) gap-6">
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-card">{t('intro')}</p>
        <p>
          {t.rich('takedown', {
            link: (chunks) => <a href={REPORT_LEGAL_LINKS.takedown}>{chunks}</a>,
          })}
        </p>
        {/* A long title with no place to break may break anywhere rather than widen the page
            (WCAG 1.4.10), as headings do (global.css). */}
        {item && (
          <p className="border border-line bg-surface p-4 wrap-anywhere">
            {t.rich('about', {
              title: item.title,
              strong: (chunks) => <strong>{chunks}</strong>,
              link: (chunks) => (
                <a href={item.path} lang={item.lang} dir={textDirection(item.lang)}>
                  {chunks}
                </a>
              ),
            })}
          </p>
        )}
        <div className="mt-4">{form}</div>
      </div>
    </main>
  )
}
