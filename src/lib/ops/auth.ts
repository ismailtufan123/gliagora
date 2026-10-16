import { timingSafeEqual } from 'node:crypto'

import { derivedKey } from '@/lib/keys'

// The operations routes (/api/ops/…, M7, D52): the first monitor run by hand and the weekly AI
// drafts' export and import, which the operator approved to run on the server. They answer only a
// request made inside the app's own container (`docker compose exec app node ops/call.mjs …`, to
// 127.0.0.1): its Host is a loopback address, and so is its X-Forwarded-For, which Next.js's server
// sets to the connection's address when a request has none. A request through Caddy names the
// site as its Host and the visitor's address in X-Forwarded-For (Caddy ignores one a visitor sends,
// since it trusts no proxy), so it is refused. Every request must also carry a key derived from
// PAYLOAD_SECRET (`gliagora/ops/token/v1`), which only someone who can read the server's settings
// has, and Caddy keeps /api behind the second password. A refused request gets the same plain 404
// as an unknown address.

export const OPS_LABEL = 'gliagora/ops/token/v1'

/** The key `ops/call.mjs` sends, as hex. */
export function opsToken(secret: string): string {
  return derivedKey(secret, OPS_LABEL).toString('hex')
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost', '[::1]'])

/** Whether `request` was made inside the container, to its loopback address. */
function fromInside(request: Request): boolean {
  for (const header of ['forwarded', 'x-real-ip', 'via']) {
    if (request.headers.has(header)) return false
  }
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (
    forwardedFor !== null &&
    !forwardedFor.split(',').every((part) => LOOPBACK.has(part.trim()))
  ) {
    return false
  }
  let host: string
  try {
    host = new URL(`http://${request.headers.get('host') ?? ''}`).hostname
  } catch {
    return false
  }
  return LOOPBACK.has(host)
}

/** Whether `request` may use an operations route. */
export function opsAllowed(request: Request, secret = process.env.PAYLOAD_SECRET ?? ''): boolean {
  if (secret === '' || !fromInside(request)) return false
  const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') ?? '')
  if (!match) return false
  return timingSafeEqual(Buffer.from(match[1]!, 'hex'), derivedKey(secret, OPS_LABEL))
}

/** The answer to a refused request: as for an address that does not exist. */
export function opsRefused(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/** A JSON answer that no cache keeps. */
export function opsJson(body: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
