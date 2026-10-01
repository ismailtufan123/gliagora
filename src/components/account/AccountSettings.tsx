import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { sendVerifyLink } from '@/app/(frontend)/en/account/actions'
import { CONTENT_PAGES } from '@/lib/content'
import { initialFormState } from '@/lib/forms/public-form'
import { emptyVerifyEmailValues } from '@/lib/forms/verify-email'
import { DISPLAY_NAME_MAX } from '@/lib/members/display-name'
import { ACCOUNT_SECTIONS, MEMBER_LEGAL_LINKS, MEMBER_PATHS } from '@/lib/members/paths'
import { CONSENT_GIVEN, SETTINGS_INPUTS, type SettingsIntent } from '@/lib/members/settings'
import type { MemberRecord } from '@/lib/members/store'
import { MAX_PREFERRED_SUBFIELDS } from '@/lib/retention/rules'
import { PRIVACY_EMAIL } from '@/lib/site'

import { EmailLinkForm } from './EmailLinkForm'

// The settings on the account page (M4b, D49; the M4b design §5, §7.4): Glia Notes, the preferred
// subfields, the email address and the display name. Plain forms that post to
// /en/account/settings/ with an `intent` (src/lib/members/settings.ts), which answers with a 303
// back to the account page and a message at its top; they work without JavaScript. Adding or
// changing the address is the one form with a spam check (a Server Action, as the other forms that
// email a link). All text comes from messages.

/** The hidden input that says which setting a form changes. */
const Intent = ({ value }: { value: SettingsIntent }) => (
  <input type="hidden" name={SETTINGS_INPUTS.intent} value={value} />
)

/** A section of the account page, with its heading. */
function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="grid justify-items-start gap-4">
      <h2 id={`${id}-heading`} className="text-h2">
        {heading}
      </h2>
      {children}
    </section>
  )
}

/** An address can be long, with no place to break: it may break anywhere. */
const strong = (chunks: ReactNode) => <strong className="wrap-anywhere">{chunks}</strong>

/**
 * Glia Notes, the monthly digest: on with the consent box (never ticked in advance), off in one
 * press. Only for an account with an email address; without one, the section says to add it first
 * (with a link to the form), or, while the form is not available, that adding one comes later.
 */
export async function DigestSettings({
  member,
  canAddEmail,
}: {
  member: MemberRecord
  /** Whether the account page offers the form that adds an address (EmailSettings). */
  canAddEmail: boolean
}) {
  const t = await getTranslations({ locale: 'en', namespace: 'account.digest' })
  const id = ACCOUNT_SECTIONS.digest
  const consentText = (chunks: ReactNode) => (
    <a href={CONTENT_PAGES.acikRiza.path} hrefLang="tr">
      {chunks}
    </a>
  )
  return (
    <Section id={id} heading={t('heading')}>
      <p>{t('text')}</p>
      {!member.email ? (
        <p>
          {canAddEmail
            ? t.rich('needsEmail', {
                link: (chunks) => <a href={`#${ACCOUNT_SECTIONS.email}`}>{chunks}</a>,
              })
            : t('needsEmailLater')}
        </p>
      ) : member.digestOptIn ? (
        <>
          <p>{t.rich('on', { email: member.email, strong })}</p>
          <form method="post" action={MEMBER_PATHS.accountSettings}>
            <Intent value="digest" />
            <input type="hidden" name={SETTINGS_INPUTS.digest} value="off" />
            <button type="submit" className="button button-secondary">
              {t('stop')}
            </button>
          </form>
        </>
      ) : (
        <>
          <p>{t.rich('off', { email: member.email, strong })}</p>
          <form method="post" action={MEMBER_PATHS.accountSettings} className="grid gap-4">
            <Intent value="digest" />
            <input type="hidden" name={SETTINGS_INPUTS.digest} value="on" />
            <div className="field">
              <div className="choice">
                <input
                  id={`${id}-consent`}
                  name={SETTINGS_INPUTS.consent}
                  type="checkbox"
                  value={CONSENT_GIVEN}
                  aria-describedby={`${id}-consent-hint`}
                />
                <label htmlFor={`${id}-consent`}>{t('consent')}</label>
              </div>
              <p id={`${id}-consent-hint`} className="field-hint choice-hint">
                {t.rich('consentHint', { link: consentText })}
              </p>
            </div>
            <div>
              <button type="submit" className="button button-primary">
                {t('start')}
              </button>
            </div>
          </form>
        </>
      )}
    </Section>
  )
}

/**
 * The preferred subfields (D35): the jobs list opened without filters shows only their positions,
 * with a notice that offers all positions. At most 12; none shows every position.
 */
export async function SubfieldSettings({
  subfields,
  chosen,
}: {
  /** The active subfields, in their own order. */
  subfields: readonly { slug: string; label: string }[]
  /** The slugs of the member's preferred subfields. */
  chosen: readonly string[]
}) {
  const t = await getTranslations({ locale: 'en', namespace: 'account.subfields' })
  const id = ACCOUNT_SECTIONS.subfields
  return (
    <Section id={id} heading={t('heading')}>
      <p>{t('text')}</p>
      <form method="post" action={MEMBER_PATHS.accountSettings} className="grid gap-4">
        <Intent value="subfields" />
        <fieldset className="grid gap-3" aria-describedby={`${id}-hint`}>
          <legend className="field-label">{t('legend')}</legend>
          <p id={`${id}-hint`} className="field-hint">
            {t('hint', { max: MAX_PREFERRED_SUBFIELDS })}
          </p>
          <ul role="list" className="grid gap-2">
            {subfields.map((subfield) => (
              <li key={subfield.slug} className="choice">
                <input
                  id={`${id}-${subfield.slug}`}
                  name={SETTINGS_INPUTS.subfield}
                  type="checkbox"
                  value={subfield.slug}
                  defaultChecked={chosen.includes(subfield.slug)}
                />
                <label htmlFor={`${id}-${subfield.slug}`}>{subfield.label}</label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div>
          <button type="submit" className="button button-primary">
            {t('save')}
          </button>
        </div>
      </form>
    </Section>
  )
}

/**
 * The account's email address, and the form that adds one or changes it: an emailed link that
 * the member opens, signed in, in this browser. Without a mail server or the spam check, the form
 * is unavailable, as the other forms that send email.
 */
export async function EmailSettings({
  member,
  available,
  altchaKey,
}: {
  member: MemberRecord
  /** Whether links can be emailed now (a mail server, the spam check and a known origin). */
  available: boolean
  altchaKey: string | null
}) {
  const t = await getTranslations({ locale: 'en', namespace: 'account.email' })
  const tSignIn = await getTranslations({ locale: 'en', namespace: 'signIn' })
  const id = ACCOUNT_SECTIONS.email
  const privacyEmail = (chunks: ReactNode) => <a href={`mailto:${PRIVACY_EMAIL}`}>{chunks}</a>
  return (
    <Section id={id} heading={t('heading')}>
      <p>{member.email ? t.rich('current', { email: member.email, strong }) : t('none')}</p>
      {available && altchaKey ? (
        <div className="grid w-full gap-4">
          <h3 className="text-h3">{t(member.email ? 'changeHeading' : 'addHeading')}</h3>
          {/* Without JavaScript the spam check cannot run; the server then says so too. */}
          <noscript>
            <p className="notice">{t('noscript')}</p>
          </noscript>
          <EmailLinkForm
            id="add-email"
            action={sendVerifyLink}
            initial={await initialFormState(emptyVerifyEmailValues(), altchaKey)}
            permalink={MEMBER_PATHS.account}
            text={{
              errorTitle: t('errors.title'),
              errorPrefix: t('errors.prefix'),
              email: {
                label: t(member.email ? 'newLabel' : 'label'),
                hint: t('hint'),
              },
              honeypot: tSignIn('honeypot'),
              spamNote: t.rich('spamNote', {
                link: (chunks) => <a href={MEMBER_LEGAL_LINKS.spamProtection}>{chunks}</a>,
              }),
              submit: t('submit'),
              sending: t('sending'),
            }}
          />
        </div>
      ) : (
        <p>{t.rich('unavailable', { email: privacyEmail })}</p>
      )}
    </Section>
  )
}

/** The display name: optional, at most 80 characters; an empty field removes it. */
export async function DisplayNameSettings({ member }: { member: MemberRecord }) {
  const t = await getTranslations({ locale: 'en', namespace: 'account.name' })
  const field = 'display-name'
  return (
    <Section id="name" heading={t('heading')}>
      <form method="post" action={MEMBER_PATHS.accountSettings} className="grid w-full gap-4">
        <Intent value="name" />
        <div className="field">
          <label htmlFor={field} className="field-label">
            {t('label')}
          </label>
          <p id={`${field}-hint`} className="field-hint">
            {t('hint', { max: DISPLAY_NAME_MAX })}
          </p>
          <input
            id={field}
            name={SETTINGS_INPUTS.displayName}
            type="text"
            autoComplete="name"
            maxLength={DISPLAY_NAME_MAX}
            defaultValue={member.displayName ?? ''}
            aria-describedby={`${field}-hint`}
            className="input"
          />
        </div>
        <div>
          <button type="submit" className="button button-primary">
            {t('save')}
          </button>
        </div>
      </form>
    </Section>
  )
}
