import { timingSafeEqual } from 'node:crypto'

import { derivedKey } from '@/lib/keys'

// The operations routes (/api/ops/…, M7, D52): the first monitor run by hand and the weekly AI
// drafts' export and import, which the operator approved to run on the server. They answer only a
// request made inside the app's own container (`docker compose exec app node ops/call.mjs …`):
// one that came through Caddy carries X-Forwarded-For and is refused, and every request must
// carry a key derived from PAYLOAD_SECRET (`gliagora/ops/token/v1`), which only someone who can
// read the server's settings has. Caddy also keeps /api behind the second password. A refused
// request gets the same plain 404 as an unknown address.

export const OPS_LABEL = 'gliagora/ops/token/v1'

/** The key `ops/call.mjs` sends, as hex. */
export function opsToken(secret: string): string {
  return derivedKey(secret, OPS_LABEL).toString('hex')
}

/** Whether `request` may use an operations route. */
export function opsAllowed(request: Request, secret = process.env.PAYLOAD_SECRET ?? ''): boolean {
  if (secret === '') return false
  // Caddy always adds X-Forwarded-For; a request from inside the container has none.
  for (const header of ['x-forwarded-for', 'forwarded', 'x-real-ip', 'via']) {
    if (request.headers.has(header)) return false
  }
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
