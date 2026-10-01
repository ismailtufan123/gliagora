import { type MemberCookie, setCookieHeader } from './cookies'

// Answers of the member POST routes (M4b, D49; the M4b design §5, §8). A state change ends in a
// `303 See Other` with a relative `Location`, so the browser follows it with a GET: never
// `redirect()`, which answers 307 in a route handler (the browser would POST again), and never an
// address built from `request.url`, which inside the Docker image names the address the server
// listens on (`http://0.0.0.0:3000`), not the site. Nothing here is kept by caches.

const NOT_STORED = 'no-store'

/** Whether `path` is a path on this site, not an address elsewhere (`//host`, `https:`). */
const isSitePath = (path: string) => path.startsWith('/') && !path.startsWith('//')

/** A 303 to a path on this site, setting or clearing the given cookies. */
export function seeOther(path: string, cookies: readonly MemberCookie[] = []): Response {
  if (!isSitePath(path) || path.includes('\\')) throw new Error('A redirect must stay on the site')
  const headers = new Headers({ Location: path, 'Cache-Control': NOT_STORED })
  for (const cookie of cookies) headers.append('Set-Cookie', setCookieHeader(cookie))
  return new Response(null, { status: 303, headers })
}

/** A POST that does not come from the site's own pages (`sameOrigin()`), or while sign-in is off. */
export function forbidden(): Response {
  return new Response('Forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': NOT_STORED },
  })
}

/** A form field's text; anything else (a file, a missing field) is null. */
export function formValue(form: FormData | null, name: string): string | null {
  const value = form?.get(name)
  return typeof value === 'string' ? value : null
}

/** The form of a POST, or null when the body is not a form. */
export async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData()
  } catch {
    return null
  }
}
