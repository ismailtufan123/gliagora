import { CONTENT_PAGES, type ContentKey } from './content'
import { DATA_REQUEST_PATHS } from './data-requests/paths'
import { NEWSLETTER_PATHS } from './newsletter/paths'
import { M2_PREFIX } from './public-path'

// The public pages of the M2 state (D41, D50; SITE_STAGE=m2, src/lib/site-stage.ts), in one
// place. From this list:
// - Caddy opens them without the site-wide password (deploy/caddy/m2-public.caddy, written by
//   `pnpm caddy:public`; a unit test fails when the file is out of date);
// - the proxy shows their M2 versions, the twins under src/app/(frontend)/m2/, with the reduced
//   header and footer (src/proxy.ts; a unit test checks that every page here has its twin and every
//   twin a line here);
// - the M2 sitemaps list the indexed ones, and the M2 robots.txt allows only them;
// - the M2 versions of pages link only to these (src/lib/m2-links.ts and the reduced shell).
// Exact addresses, never a whole folder (only Next.js's own files go by prefix): a folder would
// open whatever lies below it, such as the 404 page with the full navigation. A page answers with
// and without its trailing slash (Next.js redirects to it, PLAN §2.1), to GET and HEAD, and to POST
// where it says so. Caddy opens each address only in exactly this spelling (its `path` matcher
// alone would also open /EN/ or /en/%61bout/, which reach the app's 404 page), passes the app's
// 404s and 410s on as a plain "Not Found", and passes a page's answer only when the app marked it
// as one of its own public answers (PUBLIC_MARK, below).
//
// A text from content/ is public only once the operator has approved it (`draft: false` in
// src/lib/content.ts, D28, D41), together with the pages that belong to it (those after the
// data-request form; the Glia Notes signup and its pages, with the açık rıza metni). Approving a
// text therefore changes this list: run `pnpm caddy:public` and copy the file to the server
// (deploy/README.md, "Switching to the M2 state"); until then Caddy keeps the page behind the
// password. The twins of every text are written already, so approving one needs no code.
//
// Relative imports only: the end-to-end tests and `pnpm caddy:public` load this file as it is.

export type PublicPage = {
  /** The page's address, ending with a slash (PLAN §2.1). */
  path: string
  /**
   * `page`: has an M2 version under src/app/(frontend)/m2/ (its twin), which the proxy shows in its
   * place. `route`: answered the same in every stage and never rewritten: the redirect of `/`
   * (next.config.ts), or a route handler, such as the POST behind a page's button.
   */
  kind: 'page' | 'route'
  /** Takes POSTs too: a form's Server Action, sent to its page, or the route behind a button. */
  post?: true
  /** Listed in the M2 sitemaps and allowed in the M2 robots.txt: a page without `noindex`. */
  indexed?: true
  /** Public only once this text is approved (not a draft, src/lib/content.ts). */
  approval?: ContentKey
}

/** A text from content/: public once approved, and then indexed (`contentPageIndexed`, D28). */
const text = (key: ContentKey, more: Partial<PublicPage> = {}): PublicPage => ({
  path: CONTENT_PAGES[key].path,
  kind: 'page',
  indexed: true,
  approval: key,
  ...more,
})

/** A page after the data-request form (M4b, D49): public with its text, never indexed. */
const afterDataRequest = (path: string, more: Partial<PublicPage> = {}): PublicPage => ({
  path,
  kind: 'page',
  approval: 'dataRequests',
  ...more,
})

/**
 * A page of Glia Notes (M2, D50): public with the açık rıza metni, since the signup records the
 * subscriber's consent to that text (GLIA_NOTES_CONSENT_VERSION, src/lib/newsletter/consent.ts) and
 * links to it. Never indexed but the signup itself (`newsletterPageIndexed()`).
 */
const gliaNotes = (path: string, more: Partial<PublicPage> = {}): PublicPage => ({
  path,
  kind: 'page',
  approval: 'acikRiza',
  ...more,
})

/** Every page that is public in the M2 state, or becomes public there once its text is approved. */
export const M2_PAGES: readonly PublicPage[] = [
  // Redirects to /en/ (next.config.ts).
  { path: '/', kind: 'route' },
  // The coming-soon page (M0's text, D41) in place of the home page, which stays private.
  { path: '/en/', kind: 'page', indexed: true },
  // About (D41 (3)): approved, so public from the start.
  text('about'),
  // Glia Notes (src/lib/newsletter/paths.ts), once the açık rıza metni is approved (above): the
  // signup (its Server Action posts to the page), the pages after it, and the routes behind their
  // buttons. The unsubscribe route also takes the one-click POST of mail programs (RFC 8058),
  // which comes without a cookie or an Origin; every route answers a GET with a redirect to its
  // page.
  gliaNotes(NEWSLETTER_PATHS.signup, { post: true, indexed: true }),
  gliaNotes(NEWSLETTER_PATHS.checkInbox),
  gliaNotes(NEWSLETTER_PATHS.resend, { kind: 'route', post: true }),
  gliaNotes(NEWSLETTER_PATHS.confirm),
  gliaNotes(NEWSLETTER_PATHS.confirmUse, { kind: 'route', post: true }),
  gliaNotes(NEWSLETTER_PATHS.confirmed),
  gliaNotes(NEWSLETTER_PATHS.unsubscribe),
  gliaNotes(NEWSLETTER_PATHS.unsubscribeUse, { kind: 'route', post: true }),
  gliaNotes(NEWSLETTER_PATHS.unsubscribed),
  // The legal texts, each once approved (D41 (2)).
  text('contact'),
  text('iletisim'),
  text('privacy'),
  text('kvkk'),
  text('acikRiza'),
  text('cookies'),
  text('terms'),
  text('takedown'),
  text('accessibility'),
  text('sources'),
  // The data-request page with its form (its Server Action posts to the page), and the pages after
  // it (src/lib/data-requests/paths.ts).
  text('dataRequests', { post: true }),
  afterDataRequest(DATA_REQUEST_PATHS.sent),
  afterDataRequest(DATA_REQUEST_PATHS.confirm),
  afterDataRequest(DATA_REQUEST_PATHS.confirmUse, { kind: 'route', post: true }),
  afterDataRequest(DATA_REQUEST_PATHS.done),
  afterDataRequest(DATA_REQUEST_PATHS.received),
]

/** Whether a text is still a draft, waiting for the operator's approval. Tests pass their own. */
export type IsDraft = (key: ContentKey) => boolean

const isDraft: IsDraft = (key) => CONTENT_PAGES[key].draft

/** The pages public in the M2 state now: each one whose text, if it has one, is approved. */
export function publicPages(draft: IsDraft = isDraft): PublicPage[] {
  return M2_PAGES.filter((page) => !page.approval || !draft(page.approval))
}

/** The public pages that are indexed: the M2 sitemaps list them, robots.txt allows them. */
export const indexedPublicPages = (draft: IsDraft = isDraft) =>
  publicPages(draft).filter((page) => page.indexed)

/**
 * The machine files of the M2 state: robots.txt, the sitemap index and the files it lists, one per
 * locale with indexed pages (src/lib/seo/sitemap.ts): `pages.xml`, and `pages-tr.xml` once a
 * Turkish text is approved.
 */
export function publicMachineFiles(draft: IsDraft = isDraft): string[] {
  const turkish = indexedPublicPages(draft).some((page) => page.path.startsWith('/tr/'))
  return [
    '/robots.txt',
    '/sitemap.xml',
    '/sitemaps/pages.xml',
    ...(turkish ? ['/sitemaps/pages-tr.xml'] : []),
  ]
}

/** Next.js's scripts, styles and fonts, named by their content, so nothing else is there. */
export const NEXT_STATIC_PREFIX = '/_next/static/'

/**
 * The logos and the favicon, the files of public/brand/. Caddy opens each of them by its name
 * (`pnpm caddy:public` lists the folder), never the folder itself, whose other addresses would
 * reach the 404 page.
 */
export const BRAND_PREFIX = '/brand/'

/** What every public page loads: Next.js's own files and the logos (above). */
export const PUBLIC_ASSET_PREFIXES = [NEXT_STATIC_PREFIX, BRAND_PREFIX] as const

/** A page's address in both spellings Caddy must open: without the slash, Next.js redirects. */
const spellings = (path: string) => (path === '/' ? [path] : [path.slice(0, -1), path])

/** The exact paths the M2 state opens for GET and HEAD: the pages and the machine files. */
export function publicGetPaths(draft: IsDraft = isDraft): string[] {
  return [
    ...publicPages(draft).flatMap((page) => spellings(page.path)),
    ...publicMachineFiles(draft),
  ]
}

/** The exact paths the M2 state opens for POST. */
export function publicPostPaths(draft: IsDraft = isDraft): string[] {
  return publicPages(draft)
    .filter((page) => page.post)
    .flatMap((page) => spellings(page.path))
}

/**
 * Whether the M2 state opens an address for GET (its query string and fragment do not count), as
 * Caddy does: one of the exact paths, or a file under an asset prefix (Caddy opens only the logos
 * that exist).
 */
export function isPublicAddress(address: string, draft: IsDraft = isDraft): boolean {
  const path = address.replace(/[?#].*$/, '')
  return (
    PUBLIC_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    publicGetPaths(draft).includes(path)
  )
}

/**
 * The twin the proxy shows in place of a public page in the M2 state (`/en/about/` →
 * `/m2/en/about/`), or null for every other path. The proxy sees the path with its slash: Next.js
 * redirects the other spelling first.
 */
export function m2Twin(pathname: string, draft: IsDraft = isDraft): string | null {
  const page = publicPages(draft).find((one) => one.kind === 'page' && one.path === pathname)
  return page ? `${M2_PREFIX}${page.path}` : null
}

/**
 * Whether a request is for one of the M2 state's public addresses, with a method Caddy opens for
 * it: GET or HEAD for the pages and the machine files, POST for the forms and the routes behind
 * their buttons. The address as the proxy sees it (Next.js redirects the other spelling first).
 */
export function isPublicRequest(method: string, pathname: string, draft: IsDraft = isDraft) {
  if (method === 'GET' || method === 'HEAD') return publicGetPaths(draft).includes(pathname)
  if (method === 'POST') return publicPostPaths(draft).includes(pathname)
  return false
}

/**
 * The mark of the M2 state's public requests and answers, so that Caddy's copy of the list
 * (deploy/caddy/m2-public.caddy, copied to the server by hand) never opens more than the running
 * app shows in its M2 version, whichever of the two is behind:
 * - Caddy's public handles (pages, machine files, forms) send it with each request, and remove
 *   any copy a visitor sent (deploy/Caddyfile). The proxy answers a marked request that this image
 *   does not hold public, by its own list and while SITE_STAGE is `m2`, with a plain 404 before
 *   any page or route runs (src/proxy.ts): a text the running image still holds as a draft (after
 *   a rollback past its approval, or one taken back) stays closed, and its form does nothing.
 * - The app marks its answers to its own public requests, and Caddy passes an answer to a public
 *   page, machine file or form only with the mark (redirects pass without it: `/`, an address
 *   without its slash), then removes it. So an image from before the M2 state, which knows no
 *   mark, shows nothing either.
 */
export const PUBLIC_MARK = { name: 'X-Gliagora-Public', value: 'm2' } as const
