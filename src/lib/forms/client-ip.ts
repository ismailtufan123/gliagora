import { createHmac, hkdfSync } from 'node:crypto'
import { isIP } from 'node:net'

// Who is sending a form, for the rate limit only (PLAN §3.2, D34). The raw IP address is never
// stored or logged: the limit keeps an HMAC of it, whose key is derived from PAYLOAD_SECRET, so the
// stored value cannot be turned back into the address by trying all 4 billion IPv4 addresses
// without the secret. The hashed value is personal data too (privacy policy, "Spam protection on
// forms"); it stays in the app database on our server and is deleted after 24 hours.

/** Where a request comes from when no header says (local development without a proxy). */
export const UNKNOWN_CLIENT = 'unknown'

/**
 * The client's IP address. In production, Caddy (deploy/Caddyfile) sets X-Forwarded-For to the
 * address that connected to it: it ignores forwarding headers sent by clients, because no
 * `trusted_proxies` are configured, and the app's port is not published (deploy/compose.prod.yml),
 * so nobody can reach the app without passing through Caddy. The first entry is therefore the
 * client, for IPv6 visitors too only because the stack's network has IPv6 enabled
 * (compose.prod.yml): otherwise Docker's docker-proxy forwards them from the bridge gateway, and
 * they would all share one limit (deploy/README.md, step 5, checks this). Next.js fills the header
 * with the socket address when no proxy set it (local runs).
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  if (isIP(forwarded)) return forwarded
  const real = headers.get('x-real-ip')?.trim() ?? ''
  if (isIP(real)) return real
  return UNKNOWN_CLIENT
}

/** The eight 16-bit groups of an IPv6 address (which `isIP` has already accepted). */
function ipv6Groups(address: string): number[] {
  let value = address.toLowerCase()
  const ipv4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (ipv4) {
    const [a, b, c, d] = ipv4.slice(1).map(Number) as [number, number, number, number]
    value = `${value.slice(0, ipv4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head = '', tail] = value.split('::')
  const start = head ? head.split(':') : []
  const end = tail ? tail.split(':') : []
  const middle = tail === undefined ? [] : Array<string>(8 - start.length - end.length).fill('0')
  return [...start, ...middle, ...end].map((group) => parseInt(group, 16))
}

/**
 * What the limit counts: an IPv4 address as it is; an IPv6 address by its first 64 bits, the
 * network a single connection usually gets, because the rest can change at will; an IPv4 address
 * written as IPv6 (`::ffff:192.0.2.1`) as IPv4.
 */
export function limitSubject(ip: string): string {
  const address = ip.split('%')[0] ?? ''
  const version = isIP(address)
  if (version === 4) return address
  if (version !== 6) return UNKNOWN_CLIENT
  const groups = ipv6Groups(address)
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (mapped) {
    const [high = 0, low = 0] = groups.slice(6)
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`
}

const keys = new Map<string, Buffer>()

/** A key for hashing IP addresses, derived from PAYLOAD_SECRET (HKDF-SHA256, fixed label). */
function hashKey(secret: string): Buffer {
  let key = keys.get(secret)
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, '', 'gliagora/forms/ip-hash/v1', 32))
    keys.clear()
    keys.set(secret, key)
  }
  return key
}

/** The stored form of a client's IP address: HMAC-SHA256 (hex) of its limit subject. */
export function hashClientIp(ip: string, secret: string): string {
  if (secret === '') throw new Error('PAYLOAD_SECRET is not set.')
  return createHmac('sha256', hashKey(secret)).update(limitSubject(ip)).digest('hex')
}
