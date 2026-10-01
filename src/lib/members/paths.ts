// The addresses of member sign-in and the account pages (M4b, D49; the M4b design §5). English
// only, as the windows are; pages in other languages link here with `hrefLang="en"`. None of them is
// indexed (src/lib/indexing.ts), and robots.txt keeps crawlers out of all three trees
// (src/lib/seo/robots.ts). Caddy removes their query strings from its logs (deploy/Caddyfile).

export const MEMBER_PATHS = {
  /** The sign-in panel; `?next=` (where to go afterwards), `?save=`, `?error=`. */
  signIn: '/en/sign-in/',
  /** After asking for a sign-in link: check your inbox. */
  signInSent: '/en/sign-in/sent/',
  /** Where an emailed link leads (`?token=`): only looks the link up. */
  signInLink: '/en/sign-in/link/',
  /** The POST route that uses an emailed link. */
  signInLinkUse: '/en/sign-in/link/use/',
  /** After signing out. */
  signedOut: '/en/sign-in/signed-out/',
  /** The POST route that signs out (`scope=this` or `everywhere`). */
  signOut: '/en/sign-out/',
  /** The account overview, or the sign-in panel when signed out. */
  account: '/en/account/',
  /** "Create your Gliagora account" after signing in with Google or ORCID for the first time. */
  signInConfirm: '/en/sign-in/confirm/',
  /** The POST route behind "Create account" on that page. */
  signInCreate: '/en/sign-in/create/',
  /** The POST route of the account's settings (`intent=`): removing Google or ORCID, for now. */
  accountSettings: '/en/account/settings/',
} as const

/**
 * Where signing in with Google or ORCID starts (`?next=`, `?save=`, or `?link=1` to add it to the
 * signed-in account): a GET, which redirects to the provider.
 */
export const providerStartPath = (provider: 'google' | 'orcid') => `/en/sign-in/${provider}/`

/**
 * Where the provider sends the browser back: the redirect URI registered with Google and ORCID
 * (`https://gliagora.com/en/sign-in/google/callback/`, `…/orcid/callback/`).
 */
export const providerCallbackPath = (provider: 'google' | 'orcid') =>
  `/en/sign-in/${provider}/callback/`

/** The element an outcome message is (and its redirects' fragment): the browser focuses it. */
export const OUTCOME_ID = 'outcome'

/** Where the privacy policy describes member accounts, and the terms their conditions. */
export const MEMBER_LEGAL_LINKS = {
  privacy: '/en/legal/privacy/#member-accounts',
  spamProtection: '/en/legal/privacy/#spam-protection-on-forms',
  terms: '/en/legal/terms/#member-accounts',
} as const
