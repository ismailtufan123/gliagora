import { createTranslator } from 'next-intl'

import { type Locale, defaultLocale, locales } from '@/i18n/routing'
import { CONTENT_PAGES } from '@/lib/content'
import type { DataRequestKind } from '@/lib/data-requests/kinds'
import type { DeletionOutcome } from '@/lib/data-requests/outcome'
import { matchDetailRoute } from '@/lib/detail-routes'
import { formatDay } from '@/lib/jobs/format'
import { MEMBER_PATHS } from '@/lib/members/paths'
import type { ReportKind } from '@/lib/reports/status'
import type { RejectionReason } from '@/lib/review/status'
import { CONTACT_EMAIL, SITE_ORIGIN } from '@/lib/site'

import en from '../../../messages/en.json'
import tr from '../../../messages/tr.json'

// The automatic emails (M4.7, M4b), in the language of the form the person used, from the
// `emails` messages. Plain text only: short, readable in every mail program, and with nothing that
// could track whether it was opened. They say what the person sent us only where it identifies the
// matter (the address they suggested, or the Gliagora page a report is about), never the note or
// the details, and never our internal notes.

export type EmailText = { locale: Locale; subject: string; text: string }

/** Why a suggestion was not added, as the email says it (spam gets no email). */
export type NotAddedReason = Exclude<RejectionReason, 'spam'> | 'duplicate'

export type SuggestionOutcome =
  { kind: 'published'; jobPath: string } | { kind: 'not-added'; reason: NotAddedReason }

const MESSAGES = { en, tr } as const

export const emailLocale = (value: unknown): Locale =>
  locales.includes(value as Locale) ? (value as Locale) : defaultLocale

function translator(locale: Locale) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: 'emails' })
}

/** An absolute address on the site, for a path such as `/en/jobs/…/`. */
export const siteUrl = (path: string) => new URL(path, SITE_ORIGIN).toString()

/** The privacy notice in the person's language: the KVKK notice in Turkish. */
export const privacyUrl = (locale: Locale) =>
  siteUrl(locale === 'tr' ? CONTENT_PAGES.kvkk.path : CONTENT_PAGES.privacy.path)

const paragraphs = (...parts: (string | null)[]) =>
  `${parts.filter((part): part is string => Boolean(part)).join('\n\n')}\n`

function closing(t: ReturnType<typeof translator>) {
  return [t('automatic', { email: CONTACT_EMAIL }), `${t('signature')}\n${SITE_ORIGIN}/`]
}

/** The one email about a suggestion's outcome, to someone who asked for it (PLAN §3.2). */
export function suggestionEmail({
  locale,
  url,
  outcome,
}: {
  locale: Locale
  /** The address the person suggested. */
  url: string
  outcome: SuggestionOutcome
}): EmailText {
  const t = translator(locale)
  const decision =
    outcome.kind === 'published'
      ? `${t('suggestion.published')}\n${siteUrl(outcome.jobPath)}`
      : `${t('suggestion.notAdded')} ${t(`suggestion.reasons.${outcome.reason}`)}`
  return {
    locale,
    subject: t(
      outcome.kind === 'published' ? 'suggestion.subjectPublished' : 'suggestion.subjectNotAdded',
    ),
    text: paragraphs(
      t('greeting'),
      `${t('suggestion.intro')}\n${url}`,
      decision,
      t('suggestion.retention', { privacyUrl: privacyUrl(locale) }),
      ...closing(t),
    ),
  }
}

/**
 * The automatic acknowledgement of a report or request (the notice and takedown page: "an
 * automatic email as soon as we receive your request"). It names the page the report is about,
 * when the form was sent from one, and nothing else the person wrote.
 */
export function reportAcknowledgement({
  locale,
  kind,
  itemPath,
}: {
  locale: Locale
  kind: ReportKind | string
  /** The Gliagora page the report is about (`itemUrl`, a path on the site), if any. */
  itemPath: string | null
}): EmailText {
  const t = translator(locale)
  const rights = kind === 'personal-rights'
  const onSite = itemPath?.startsWith('/') ? itemPath : null
  const item = onSite ? `${t('report.item')}\n${siteUrl(onSite)}` : null
  // An institution has no posting to check against (D40); a job and a general report do.
  const next = rights
    ? 'report.nextPersonalRights'
    : onSite && matchDetailRoute(onSite)?.kind === 'institution'
      ? 'report.nextInstitution'
      : 'report.next'
  return {
    locale,
    subject: t(rights ? 'report.subjectPersonalRights' : 'report.subject'),
    text: paragraphs(
      t('greeting'),
      t(rights ? 'report.introPersonalRights' : 'report.intro'),
      item,
      t(next),
      t(rights ? 'report.retentionPersonalRights' : 'report.retention', {
        privacyUrl: privacyUrl(locale),
      }),
      ...closing(t),
    ),
  }
}

/**
 * The sign-in link (M4b, D49; the M4b design §7.1), sent while the person waits, to the address
 * they typed. Every address gets the same text, whether it has an account or not (the link leads
 * to "Sign in" or to "Create account"), so the email reveals nothing about who has an account.
 * `link` is absolute, on the site's own origin (`appOrigin()`): only this server knows the token.
 */
export function signInEmail({ locale, link }: { locale: Locale; link: string }): EmailText {
  const t = translator(locale)
  return {
    locale,
    subject: t('signIn.subject'),
    text: paragraphs(
      t('greeting'),
      `${t('signIn.intro')}\n${link}`,
      t('signIn.validity'),
      t('signIn.sameBrowser'),
      t('signIn.notYou'),
      ...closing(t),
    ),
  }
}

/**
 * The link that adds an address to a member's account (M4b, D49; the M4b design §7.4), sent while
 * the member waits, to the address they typed. It says that someone signed in to an account asked
 * for it, never which account, and the same whether or not the address belongs to another account:
 * that is decided when the link is used, by the member who asked, in the browser where they are
 * signed in. `link` is absolute, on the site's own origin (`appOrigin()`).
 */
export function verifyEmailEmail({ locale, link }: { locale: Locale; link: string }): EmailText {
  const t = translator(locale)
  return {
    locale,
    subject: t('verifyEmail.subject'),
    text: paragraphs(
      t('greeting'),
      `${t('verifyEmail.intro')}\n${link}`,
      t('verifyEmail.validity'),
      t('verifyEmail.notYou'),
      ...closing(t),
    ),
  }
}

/**
 * The one email after a member deleted their account in its settings (M4b, D49; the M4b design
 * §7.6), sent by `sendRequestEmails` from the request's record within minutes: what was deleted and
 * what stays (the record of the request, the backups). Nothing about the account itself.
 */
export function accountDeletedEmail({ locale }: { locale: Locale }): EmailText {
  const t = translator(locale)
  return {
    locale,
    subject: t('account.deleted.subject'),
    text: paragraphs(
      t('greeting'),
      t('account.deleted.text'),
      t('account.deleted.kept', { privacyUrl: privacyUrl(locale) }),
      ...closing(t),
    ),
  }
}

/**
 * The warning before an account is deleted for inactivity (M4b, D49; the M4b design §7.7; PLAN
 * §18.1), sent by `cleanInactiveMembers` 24 months after the member's last activity: the day before
 * which to sign in to keep the account (`day`, `YYYY-MM-DD`, chosen by `warningDeadlineDay` so that
 * it holds in every time zone, src/lib/retention/rules.ts) and a plain link to the sign-in page,
 * which carries no token (signing in by any method keeps the account).
 */
export function inactivityWarningEmail({
  locale,
  day,
}: {
  locale: Locale
  day: string
}): EmailText {
  const t = translator(locale)
  const date = formatDay(day, locale)
  return {
    locale,
    subject: t('account.inactiveWarning.subject'),
    text: paragraphs(
      t('greeting'),
      `${t('account.inactiveWarning.text', { date })}\n${siteUrl(MEMBER_PATHS.signIn)}`,
      t('account.inactiveWarning.after'),
      t('account.inactiveWarning.why', { privacyUrl: privacyUrl(locale) }),
      ...closing(t),
    ),
  }
}

/**
 * The link that confirms a request from the data-request form (M4b, D49; the M4b design §7.8, §9),
 * sent while the person waits, to the address they typed. It is also the acknowledgement that the
 * request arrived. It names the kind of request (one of the form's choices), never what the person
 * wrote, says that nothing is done until the link is used, and what stays if it never is (the
 * request's type, date and a scrambled code of the address, for 60 days). `link` is absolute, on
 * the site's own origin (`appOrigin()`).
 */
export function dataRequestConfirmEmail({
  locale,
  kind,
  link,
}: {
  locale: Locale
  kind: DataRequestKind
  link: string
}): EmailText {
  const t = translator(locale)
  return {
    locale,
    subject: t('dataRequest.confirm.subject'),
    text: paragraphs(
      t('greeting'),
      t(`dataRequest.confirm.types.${kind}`),
      `${t('dataRequest.confirm.act')}\n${link}`,
      t('dataRequest.confirm.validity'),
      t('dataRequest.confirm.notYou'),
      ...closing(t),
    ),
  }
}

/**
 * The one email after a confirmed deletion from the data-request form (M4b, D49; the M4b design
 * §7.8, §9), sent by `sendRequestEmails` from the request's record within minutes: what was deleted
 * (from the counts in its `outcome`, never what the records said), which requests about personal
 * rights keep the address and why, and what stays (the record of the request, the backups).
 */
export function dataDeletedEmail({
  locale,
  outcome,
}: {
  locale: Locale
  outcome: DeletionOutcome
}): EmailText {
  const t = translator(locale)
  const deleted = [
    outcome.suggestionsDeleted > 0
      ? t('dataRequest.deleted.suggestions', { count: outcome.suggestionsDeleted })
      : null,
    outcome.accountDeleted > 0 ? t('dataRequest.deleted.account') : null,
    outcome.newsletterRemoved > 0 ? t('dataRequest.deleted.newsletter') : null,
    outcome.reportAddressesCleared > 0
      ? t('dataRequest.deleted.reports', { count: outcome.reportAddressesCleared })
      : null,
  ].filter((line): line is string => line !== null)
  return {
    locale,
    subject: t('dataRequest.deleted.subject'),
    text: paragraphs(
      t('greeting'),
      deleted.length > 0
        ? `${t('dataRequest.deleted.text')}\n${deleted.map((line) => `- ${line}`).join('\n')}`
        : t('dataRequest.deleted.nothing'),
      outcome.personalRightsReportsKept > 0
        ? t('dataRequest.deleted.kept', { count: outcome.personalRightsReportsKept })
        : null,
      t('dataRequest.deleted.record', { privacyUrl: privacyUrl(locale) }),
      ...closing(t),
    ),
  }
}
