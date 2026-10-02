import { canSendEmail } from '@/lib/email/settings'
import { altchaKey } from '@/lib/forms/altcha'

// Whether Glia Notes is switched on (M2, D50; PLAN §13). Each part switches on by itself once its
// settings exist, so production keeps answering "the signup opens soon" until the operator sets
// them on the server:
// - listmonk: LISTMONK_URL (deploy/compose.prod.yml gives the app http://listmonk:9000) and
//   LISTMONK_API_TOKEN, the token of the app's API user (deploy/listmonk/settings.sql makes it with
//   the same value), whose name is LISTMONK_API_USER (`gliagora-app` unless set). Unsubscribing, and
//   repeating logged deletions of subscribers after a restore, need only these.
// - The signup also needs a mail server (SMTP_HOST, for the confirmation email) and the spam check
//   (ALTCHA_HMAC_KEY); the page also needs the site's own origin (`appOrigin()`), for the links in
//   the emails, which it reads per request.
// Read at request time: the image is built without the server's settings, so nothing static may
// depend on them. An unusable setting switches the newsletter off with a problem that names the
// variable, never its value (the token is a secret); the app never stops for it.

type Env = Record<string, string | undefined>

/** The app's API user in listmonk, as deploy/listmonk/settings.sql names it. */
export const DEFAULT_LISTMONK_API_USER = 'gliagora-app'

/** listmonk's own rule for user names (its `users.username`). */
const API_USER = /^[a-zA-Z0-9_.@-]{1,200}$/
/** A token that can go into a header as it is: `openssl rand -hex 32` gives 64 hex digits. */
const API_TOKEN = /^[A-Za-z0-9._~-]{16,256}$/

/** How the app reaches listmonk's API. */
export type ListmonkSettings = {
  /** listmonk's address, without a trailing slash (`http://listmonk:9000`). */
  url: string
  user: string
  token: string
}

export type SignupOff = 'no-listmonk' | 'no-smtp' | 'no-altcha'

export type NewsletterConfig = {
  /** null: the newsletter is off (no signup, no unsubscribe, no deletions in listmonk). */
  listmonk: ListmonkSettings | null
  signup: { on: true } | { on: false; reason: SignupOff }
  /** One line per unusable setting, for the log: names, never values. */
  problems: string[]
}

/** A setting that is set and not still the `replace-with…` placeholder of an example file. */
function setting(env: Env, name: string): string | null {
  const value = env[name]?.trim() ?? ''
  return value !== '' && !value.startsWith('replace-with') ? value : null
}

/** listmonk's address from LISTMONK_URL: http or https, nothing but an origin and a path. */
function listmonkUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null
  if (url.username || url.password || url.search || url.hash) return null
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

/** listmonk's API settings, or null (with a problem for each unusable one). */
export function listmonkSettings(env: Env = process.env, problems: string[] = []) {
  const url = setting(env, 'LISTMONK_URL')
  const token = setting(env, 'LISTMONK_API_TOKEN')
  const user = setting(env, 'LISTMONK_API_USER') ?? DEFAULT_LISTMONK_API_USER
  if (!url && !token) return null
  let usable = true
  if (!url) {
    problems.push('Glia Notes is off: LISTMONK_API_TOKEN is set, LISTMONK_URL is not.')
    usable = false
  } else if (!listmonkUrl(url)) {
    problems.push('Glia Notes is off: LISTMONK_URL is not an http or https address.')
    usable = false
  }
  if (!token) {
    problems.push('Glia Notes is off: LISTMONK_URL is set, LISTMONK_API_TOKEN is not.')
    usable = false
  } else if (!API_TOKEN.test(token)) {
    problems.push(
      'Glia Notes is off: LISTMONK_API_TOKEN must be 16 to 256 letters, digits or ._~- (openssl rand -hex 32).',
    )
    usable = false
  }
  if (!API_USER.test(user)) {
    problems.push('Glia Notes is off: LISTMONK_API_USER is not a listmonk user name.')
    usable = false
  }
  if (!usable || !url || !token) return null
  return { url: listmonkUrl(url)!, user, token } satisfies ListmonkSettings
}

/** Which parts of Glia Notes are on, from the environment. */
export function newsletterConfig(env: Env = process.env): NewsletterConfig {
  const problems: string[] = []
  const listmonk = listmonkSettings(env, problems)
  const signup: NewsletterConfig['signup'] = !listmonk
    ? { on: false, reason: 'no-listmonk' }
    : !canSendEmail(env)
      ? { on: false, reason: 'no-smtp' }
      : !altchaKey(env)
        ? { on: false, reason: 'no-altcha' }
        : { on: true }
  return { listmonk, signup, problems }
}

const OFF_REASONS: Record<SignupOff, string> = {
  'no-listmonk': 'no listmonk settings',
  'no-smtp': 'no mail server',
  'no-altcha': 'no spam-check key',
}

/** The startup line: whether the signup and unsubscribing are on, and why not; never a value. */
export function describeNewsletter(config: NewsletterConfig): string {
  const signup = config.signup.on ? 'on' : `off (${OFF_REASONS[config.signup.reason]})`
  return `Glia Notes: signup ${signup}, unsubscribe ${config.listmonk ? 'on' : 'off'}`
}
