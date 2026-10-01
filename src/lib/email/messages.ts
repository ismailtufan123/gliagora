import { createTranslator } from 'next-intl'

import { type Locale, defaultLocale, locales } from '@/i18n/routing'
import { CONTENT_PAGES } from '@/lib/content'
import { matchDetailRoute } from '@/lib/detail-routes'
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
