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
} as const

/** The element an outcome message is (and its redirects' fragment): the browser focuses it. */
export const OUTCOME_ID = 'outcome'

/** Where the privacy policy describes member accounts, and the terms their conditions. */
export const MEMBER_LEGAL_LINKS = {
  privacy: '/en/legal/privacy/#member-accounts',
  spamProtection: '/en/legal/privacy/#spam-protection-on-forms',
  terms: '/en/legal/terms/#member-accounts',
} as const
