import { SHORT_ID_CHAR } from '@/lib/short-id'

// Where sign-in leads afterwards (`next`), and what it saves on the way (`save`) (M4b, D49; the
// M4b design §8). Both arrive in links anyone can craft, so neither may lead off the site, into the
// admin or back into sign-in, and `save` names only a job by its short ID.

/** Where sign-in leads when `next` is missing or refused. */
export const DEFAULT_NEXT = '/en/account/'

/** The longest `next` kept with its query; a longer one keeps only its path. */
export const NEXT_MAX = 1000

/**
 * Refused before parsing, since the URL parser would quietly rewrite them: a backslash (which it
 * reads as a slash) and control characters (which it drops). A value that starts with `//` names
 * another host, and a path with `//` in it only looks like one; both are refused too.
 */
const UNSAFE = /[\\\u0000-\u001F\u007F]|^\/\//

/** Paths sign-in never returns to. `/admin` and `/api` are outside `/en/` and `/tr/` anyway. */
const REFUSED = ['/en/sign-in', '/en/sign-out']

/**
 * A safe `next` for sign-in: a path (and query) on the site's own `origin` under `/en/` or `/tr/`,
 * rebuilt from the parsed URL (no fragment), or DEFAULT_NEXT.
 */
export function safeNext(next: string | null | undefined, origin: string): string {
  if (typeof next !== 'string' || next === '' || UNSAFE.test(next)) return DEFAULT_NEXT
  let url: URL
  let own: string
  try {
    own = new URL(origin).origin
    url = new URL(next, own)
  } catch {
    return DEFAULT_NEXT
  }
  if (url.origin !== own) return DEFAULT_NEXT
  const path = url.pathname
  if (!path.startsWith('/en/') && !path.startsWith('/tr/')) return DEFAULT_NEXT
  if (path.includes('//')) return DEFAULT_NEXT
  if (REFUSED.some((refused) => path.startsWith(refused))) return DEFAULT_NEXT
  const full = `${path}${url.search}`
  if (full.length <= NEXT_MAX) return full
  return path.length <= NEXT_MAX ? path : DEFAULT_NEXT
}

const SAVE = new RegExp(`^job:(${SHORT_ID_CHAR}{5})$`)

/** What sign-in saves afterwards: a job by its short ID. */
export type SaveRef = { type: 'job'; shortId: string }

/** Reads `save` (`job:k3f9a`), or null for anything else. */
export function parseSave(value: string | null | undefined): SaveRef | null {
  const match = typeof value === 'string' ? SAVE.exec(value) : null
  return match ? { type: 'job', shortId: match[1]! } : null
}

/** The `save` value for a job. */
export const saveValue = (ref: SaveRef) => `${ref.type}:${ref.shortId}`
