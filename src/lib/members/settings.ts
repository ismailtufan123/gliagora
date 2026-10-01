import { z } from 'zod'

import { errorSummary } from '@/lib/errors'
import { newReference } from '@/lib/forms/public-form'
import { MAX_PREFERRED_SUBFIELDS } from '@/lib/retention/rules'

import type { MemberCookie } from './cookies'
import { DISPLAY_NAME_MAX, UNSAFE_IN_NAME } from './display-name'
import { sameOrigin } from './origin'
import { type DoneCode, type ErrorCode, outcomePath } from './outcome'
import { MEMBER_PATHS } from './paths'
import type { ProviderChange } from './provider-sign-in'
import { forbidden, formValue, readForm, seeOther } from './responses'
import type { DigestChoice, MemberRecord } from './store'

// The account's settings (M4b, D49; the M4b design §5, §7.3, §7.4): the forms on /en/account/ post
// to /en/account/settings/ with an `intent`.
//
// - `digest`: Glia Notes on (`digest=on`, with the consent box `consent=yes`, which is never ticked
//   in advance; only for an account with an email address, always one the member proved) or off
//   (`digest=off`, one press). The choice is recorded with its time and the date of the consent
//   text; it is only stored until M2, when listmonk receives it (PLAN §13).
// - `subfields`: the preferred subfields (`subfield`, one per ticked box), at most 12: the jobs
//   list's default filter (D35). None removes them all.
// - `name`: the display name (`displayName`), at most 80 characters; empty removes it.
// - `unlink-google`, `unlink-orcid`: remove Google or ORCID, unless it is the last way into the
//   account (checked again in SQL). A removal gives this browser a new session and ends every
//   other session of the member: a session made through the method just removed does not survive.
//
// Only from the site's own pages (`sameOrigin`), and only while signed in (signed out, the account
// page shows the sign-in panel). Answers are 303s to the account page with what happened
// (`#outcome`, which the browser focuses).

export const SETTINGS_INTENTS = [
  'digest',
  'subfields',
  'name',
  'unlink-google',
  'unlink-orcid',
] as const
export type SettingsIntent = (typeof SETTINGS_INTENTS)[number]

/** The names of the settings forms' inputs. */
export const SETTINGS_INPUTS = {
  intent: 'intent',
  digest: 'digest',
  consent: 'consent',
  subfield: 'subfield',
  displayName: 'displayName',
} as const

/** The value of the ticked consent box. */
export const CONSENT_GIVEN = 'yes'

/** What the settings route reads and writes (the route gives the real ones). */
export type SettingsDeps = {
  now: Date
  /** The date of the Glia Notes consent text (`CONTENT_PAGES.acikRiza.updated`). */
  consentVersion: string
  env?: Record<string, string | undefined>
  /** The session of the request's cookie: its member and token, or null. */
  session(): Promise<{ member: MemberRecord; token: string } | null>
  setDigest(memberId: number, choice: DigestChoice): Promise<boolean>
  setSubfields(memberId: number, slugs: string[]): Promise<number>
  setName(memberId: number, name: string | null): Promise<boolean>
  unlink(memberId: number, method: 'google' | 'orcid'): Promise<ProviderChange>
  /** A new session for this browser that ends the member's others (after a change of methods). */
  rotate(memberId: number, token: string): Promise<{ cookie: MemberCookie; othersEnded: number }>
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** More boxes than there are subfields is not a person's form: read at most this many values. */
const SUBFIELDS_READ_MAX = 100

/** The ticked subfields: well-formed slugs, each once, or null when the form is not one we sent. */
export function readSubfields(form: FormData | null): string[] | null {
  const values = (form?.getAll(SETTINGS_INPUTS.subfield) ?? []).slice(0, SUBFIELDS_READ_MAX)
  const parsed = z.array(z.string().trim().max(100).regex(SLUG)).safeParse(values)
  return parsed.success ? [...new Set(parsed.data)] : null
}

/**
 * The display name as stored: NFC, runs of white space (tabs and line breaks among them) as one
 * space, trimmed; null when empty (the name is removed); `invalid` with any other control or
 * direction character (UNSAFE_IN_NAME) or more than 80 characters.
 */
export function readDisplayName(value: string | null): string | null | 'invalid' {
  if (value === null) return 'invalid'
  const name = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (UNSAFE_IN_NAME.test(name)) return 'invalid'
  if (name === '') return null
  return name.length > DISPLAY_NAME_MAX ? 'invalid' : name
}

const toAccount = (outcome: { done: DoneCode } | { error: ErrorCode; reference?: string }) =>
  seeOther(outcomePath(MEMBER_PATHS.account, outcome))

/** POST `/en/account/settings/`. */
export async function handleSettings(request: Request, deps: SettingsDeps): Promise<Response> {
  if (!sameOrigin(request.headers, deps.env)) return forbidden()
  const form = await readForm(request)
  const intent = z.enum(SETTINGS_INTENTS).safeParse(formValue(form, SETTINGS_INPUTS.intent))
  try {
    const session = await deps.session()
    if (!session) return seeOther(MEMBER_PATHS.account)
    if (!intent.success) return toAccount({ error: 'failed' })
    const { member, token } = session
    switch (intent.data) {
      case 'digest': {
        const choice = formValue(form, SETTINGS_INPUTS.digest)
        if (choice === 'off') {
          await deps.setDigest(member.id, { optIn: false })
          return toAccount({ done: 'digest-off' })
        }
        if (choice !== 'on') return toAccount({ error: 'failed' })
        if (!member.email) return toAccount({ error: 'digest-needs-email' })
        if (formValue(form, SETTINGS_INPUTS.consent) !== CONSENT_GIVEN) {
          return toAccount({ error: 'digest-consent' })
        }
        const stored = await deps.setDigest(member.id, {
          optIn: true,
          version: deps.consentVersion,
        })
        return toAccount(stored ? { done: 'digest-on' } : { error: 'digest-needs-email' })
      }
      case 'subfields': {
        const slugs = readSubfields(form)
        if (!slugs) return toAccount({ error: 'failed' })
        if (slugs.length > MAX_PREFERRED_SUBFIELDS)
          return toAccount({ error: 'subfields-too-many' })
        const stored = await deps.setSubfields(member.id, slugs)
        return toAccount({ done: stored > 0 ? 'subfields-saved' : 'subfields-removed' })
      }
      case 'name': {
        const name = readDisplayName(formValue(form, SETTINGS_INPUTS.displayName))
        if (name === 'invalid') return toAccount({ error: 'name-invalid' })
        await deps.setName(member.id, name)
        return toAccount({ done: name === null ? 'name-removed' : 'name-saved' })
      }
      case 'unlink-google':
      case 'unlink-orcid': {
        const method = intent.data === 'unlink-google' ? 'google' : 'orcid'
        const done = method === 'google' ? 'unlinked-google' : 'unlinked-orcid'
        const result = await deps.unlink(member.id, method)
        if (result.kind === 'refused') return toAccount({ error: result.reason })
        if (!result.changed) return toAccount({ done })
        const { cookie, othersEnded } = await deps.rotate(member.id, token)
        return seeOther(outcomePath(MEMBER_PATHS.account, { done, othersEnded: othersEnded > 0 }), [
          cookie,
        ])
      }
    }
  } catch (error) {
    const reference = newReference()
    console.error(`Account settings failed (reference ${reference}): ${errorSummary(error)}`)
    return toAccount({ error: 'failed', reference })
  }
}
