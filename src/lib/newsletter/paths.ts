import { paths } from '@/lib/site'

// The addresses of Glia Notes (M2, D50; PLAN §9.10, §13). English only, as the windows are. The
// signup page is indexed (`newsletterSignupIndexed()`); every page after it is about one person and
// never indexed (`newsletterPageIndexed()`, src/lib/indexing.ts). Caddy removes the query strings of
// every address under /en/newsletter from its logs (deploy/Caddyfile), so the confirmation link's
// token and a subscriber's UUID are never written there. Every address ends with a slash: a mail
// program's one-click unsubscribe may not follow the redirect that adds one.

const PAGE = paths.section('newsletter')

export const NEWSLETTER_PATHS = {
  /** The signup form. */
  signup: PAGE,
  /** After the form: "Check your inbox", with "Send it again" (a sealed cookie names the address). */
  checkInbox: `${PAGE}check-your-inbox/`,
  /** The POST route behind "Send it again". */
  resend: `${PAGE}resend/`,
  /** Where the emailed link leads (`?token=`): only looks the link up. */
  confirm: `${PAGE}confirm/`,
  /** The POST route behind the confirmation page's button. */
  confirmUse: `${PAGE}confirm/use/`,
  /** After confirming. */
  confirmed: `${PAGE}confirmed/`,
  /**
   * The page the unsubscribe link in every email opens (`?id=` listmonk's subscriber ID, `?s=` its
   * UUID).
   */
  unsubscribe: `${PAGE}unsubscribe/`,
  /**
   * The POST route behind its button, and the address of `List-Unsubscribe` (RFC 8058's one-click
   * POST from mail programs, `?id=&s=`).
   */
  unsubscribeUse: `${PAGE}unsubscribe/use/`,
  /** After unsubscribing. */
  unsubscribed: `${PAGE}unsubscribed/`,
} as const

/** The parts of the legal texts the form links to (headings in content/…, see markdown.ts). */
export const NEWSLETTER_LEGAL_LINKS = {
  privacy: '/en/legal/privacy/#glia-notes-newsletter',
  kvkk: '/tr/legal/kvkk-aydinlatma-metni/#glia-notes-bulten-aboneligi',
  consent: '/tr/legal/acik-riza-metni/',
  spamProtection: '/en/legal/privacy/#spam-protection-on-forms',
} as const

/**
 * A subscriber's unsubscribe link carries listmonk's subscriber ID (`id`, which the app looks up)
 * and its UUID (`s`, the credential, compared with the one listmonk answers; M2, D50). The
 * welcome email builds them here; listmonk's issues will build the same addresses in their
 * templates, with `?id={{ .Subscriber.ID }}&s={{ .Subscriber.UUID }}` (M11; PLAN §13).
 */
const unsubscribeQuery = (id: number, uuid: string) =>
  `?id=${encodeURIComponent(String(id))}&s=${encodeURIComponent(uuid)}`

/** The unsubscribe page for a subscriber (the visible link in every email), on `origin`. */
export const unsubscribePageUrl = (origin: string, id: number, uuid: string) =>
  `${origin}${NEWSLETTER_PATHS.unsubscribe}${unsubscribeQuery(id, uuid)}`

/** The one-click unsubscribe for a subscriber (`List-Unsubscribe`), on `origin`. */
export const oneClickUrl = (origin: string, id: number, uuid: string) =>
  `${origin}${NEWSLETTER_PATHS.unsubscribeUse}${unsubscribeQuery(id, uuid)}`

/** The unsubscribe page's own address for a subscriber (relative, for redirects). */
export const unsubscribePagePathFor = (id: number, uuid: string) =>
  `${NEWSLETTER_PATHS.unsubscribe}${unsubscribeQuery(id, uuid)}`
