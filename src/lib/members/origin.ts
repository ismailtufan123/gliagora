// The site's own origin and the origin check of member routes (M4b, D49; the M4b design §8).
//
// Never taken from `request.url` or `nextUrl.origin`: inside the Docker image Next.js builds those
// from the address it listens on (`http://0.0.0.0:3000`), not from the address the browser used.
// In production the origin is SERVER_URL's (https://gliagora.com, set by deploy/compose.prod.yml).
// Without SERVER_URL (local runs, the CI e2e app) it is the request's Host, accepted only for this
// computer's names, so links, redirect addresses and the origin check match the browser's
// `http://localhost:3000`. Anywhere else member sign-in is off: start routes send people back to
// the sign-in page and POST routes answer 403.

type Headers = { get(name: string): string | null }
type Env = Record<string, string | undefined>

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/

/** Whether a URL's hostname (as `URL.hostname` writes it) is this computer. */
export const isLoopbackHostname = (hostname: string) =>
  LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())

/**
 * The site's origin (`https://gliagora.com`, `http://localhost:3000`), or null when it cannot be
 * known safely: SERVER_URL that is not https (except on this computer), or no SERVER_URL and a
 * Host header that is not this computer.
 */
export function appOrigin(headers: Headers, env: Env = process.env): string | null {
  const server = env.SERVER_URL?.trim()
  if (server) {
    let url: URL
    try {
      url = new URL(server)
    } catch {
      return null
    }
    if (url.protocol === 'https:') return url.origin
    return url.protocol === 'http:' && isLoopbackHostname(url.hostname) ? url.origin : null
  }
  const host = headers.get('host')?.trim().toLowerCase() ?? ''
  const match = LOOPBACK_HOST.exec(host)
  if (!match) return null
  const port = match[2]
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65_535)) return null
  return `http://${host}`
}

/**
 * Whether a POST comes from the site's own pages (every member route checks this, besides
 * SameSite=Lax). Browsers send Sec-Fetch-Site, which no page can set: it must be `same-origin`.
 * Without it (older browsers), Origin must be the site's own; `Origin: null` (sent after a page
 * with `Referrer-Policy: no-referrer`, a sandboxed frame or a redirect from elsewhere) is refused.
 * Server Actions keep Next.js's own check.
 */
export function sameOrigin(headers: Headers, env: Env = process.env): boolean {
  const origin = appOrigin(headers, env)
  if (!origin) return false
  const site = headers.get('sec-fetch-site')
  if (site !== null) return site === 'same-origin'
  const from = headers.get('origin')
  return from !== null && from !== 'null' && from === origin
}

/**
 * Whether a GET was started from the site's own pages: needed to start linking Google or ORCID to
 * the signed-in account (a link, since the CSP's `form-action 'self'` blocks a POST that redirects
 * to the provider), so another site cannot start it in a signed-in browser.
 */
export function startedHere(headers: Headers): boolean {
  return headers.get('sec-fetch-site') === 'same-origin'
}

/**
 * What a start of signing in with Google or ORCID does with the position it carries to save
 * afterwards (`save`, the M4b design §3). Google or ORCID may answer without showing anything (a
 * person signed in there who has allowed Gliagora before), so the save must have been named on a
 * page of ours first: the sign-in page, the only page whose links carry `save`. `keep` it when the
 * start came from the site's own pages (Sec-Fetch-Site `same-origin`); `ask` first when it came
 * from anywhere else (another site, `same-site`, or `none`: an email, the address bar, a
 * bookmark), by sending the browser to the sign-in page, which names the position; `drop` it when
 * the browser does not say (older browsers), and sign in without saving: the sign-in page's own
 * links arrive without the header too, so sending them there would never end.
 */
export function saveAtStart(headers: Headers): 'keep' | 'ask' | 'drop' {
  const site = headers.get('sec-fetch-site')
  if (site === null) return 'drop'
  return site === 'same-origin' ? 'keep' : 'ask'
}
