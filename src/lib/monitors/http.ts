// How the monitors read other sites (D52): politely, and only what they need. One request at a
// time (a run reads its sources one after another), at least a few seconds between two requests
// to the same host (longer if its robots.txt asks for it), a user agent that names Gliagora and
// links to the About page's section on it, no cookies, no JavaScript, a time limit for each
// request and a size limit for each answer. Redirects are followed by hand, each new address
// checked by `allow` (robots.txt) before it is requested.

/** The product token robots.txt files can name (`User-agent: Gliagora-Monitor`). */
export const PRODUCT_TOKEN = 'Gliagora-Monitor'

/** The About page's section that explains the monitor (content/en/about.md). */
export const MONITOR_INFO_URL = 'https://gliagora.com/en/about/#reading-employers-pages'

export const MONITOR_USER_AGENT = `${PRODUCT_TOKEN}/1.0 (+${MONITOR_INFO_URL})`

/** The shortest pause between two requests to one host. */
export const HOST_DELAY_MS = 3_000

/** A robots.txt may ask for a longer pause; beyond this the source is read by an editor. */
export const MAX_CRAWL_DELAY_S = 60

const TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

/** Why a request gave nothing to read. Names a kind and an HTTP status, never a page's text. */
export class FetchProblem extends Error {
  constructor(
    readonly kind: 'timeout' | 'too-large' | 'network' | 'status' | 'redirect' | 'refused',
    readonly status?: number,
  ) {
    super(status ? `${kind} ${status}` : kind)
    this.name = 'FetchProblem'
  }
}

export type Fetched = {
  /** The address that answered, after redirects. */
  url: string
  status: number
  contentType: string
  text: string
  /** Whether the answer reserves text and data mining (the `tdm-reservation: 1` header). */
  tdmReserved: boolean
}

export type FetchOptions = {
  /** The Accept header. */
  accept: string
  /** The largest answer read, in bytes. */
  maxBytes: number
  /** Whether a redirect target may be requested (robots.txt); the first address is checked too. */
  allow?: (url: URL) => Promise<boolean>
}

export type Fetcher = {
  get: (url: string, options: FetchOptions) => Promise<Fetched>
  /** Asks for a longer pause between requests to `host` (its robots.txt's Crawl-delay). */
  slowDown: (host: string, seconds: number) => void
}

type Clock = { now: () => number; sleep: (ms: number) => Promise<void> }

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** The charset an answer names, or one a page names in its first bytes. */
function charsetOf(contentType: string, head: Uint8Array): string {
  const named = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  if (named) return named
  const start = new TextDecoder('latin1').decode(head.subarray(0, 2048))
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(start)?.[1] ?? 'utf-8'
}

function decode(bytes: Uint8Array, contentType: string): string {
  const label = charsetOf(contentType, bytes)
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    // A charset the runtime does not know.
    return new TextDecoder('utf-8').decode(bytes)
  }
}

async function readBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {})
    throw new FetchProblem('too-large')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new FetchProblem('too-large')
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/** A fetcher that keeps the pauses per host. `fetchImpl` and `clock` are replaced in tests. */
export function politeFetcher({
  fetchImpl = globalThis.fetch,
  clock = realClock,
  hostDelayMs = HOST_DELAY_MS,
}: { fetchImpl?: typeof fetch; clock?: Clock; hostDelayMs?: number } = {}): Fetcher {
  const lastAt = new Map<string, number>()
  const delays = new Map<string, number>()

  async function wait(host: string) {
    const last = lastAt.get(host)
    const delay = Math.max(hostDelayMs, delays.get(host) ?? 0)
    if (last !== undefined) {
      const due = last + delay - clock.now()
      if (due > 0) await clock.sleep(due)
    }
    lastAt.set(host, clock.now())
  }

  async function get(address: string, options: FetchOptions): Promise<Fetched> {
    let url = new URL(address)
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new FetchProblem('redirect')
      if (options.allow && !(await options.allow(url))) throw new FetchProblem('refused')
      await wait(url.host)
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          redirect: 'manual',
          credentials: 'omit',
          cache: 'no-store',
          headers: {
            'User-Agent': MONITOR_USER_AGENT,
            Accept: options.accept,
            'Accept-Language': 'en',
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        const name = (error as { name?: string } | null)?.name
        throw new FetchProblem(
          name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
        )
      }
      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        await response.body?.cancel().catch(() => {})
        const location = response.headers.get('location')
        if (!location) throw new FetchProblem('redirect', response.status)
        url = new URL(location, url)
        continue
      }
      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel().catch(() => {})
        throw new FetchProblem('status', response.status)
      }
      const contentType = response.headers.get('content-type') ?? ''
      let bytes: Uint8Array
      try {
        bytes = await readBody(response, options.maxBytes)
      } catch (error) {
        if (error instanceof FetchProblem) throw error
        const name = (error as { name?: string } | null)?.name
        throw new FetchProblem(
          name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
        )
      }
      return {
        url: url.toString(),
        status: response.status,
        contentType,
        text: decode(bytes, contentType),
        tdmReserved: response.headers.get('tdm-reservation')?.trim() === '1',
      }
    }
    throw new FetchProblem('redirect')
  }

  return {
    get,
    slowDown: (host, seconds) => {
      if (Number.isFinite(seconds) && seconds > 0) delays.set(host, seconds * 1000)
    },
  }
}
