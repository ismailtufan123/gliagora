import { createHmac, hkdfSync } from 'node:crypto'

// Keys derived from PAYLOAD_SECRET (HKDF-SHA256, empty salt, 32 bytes), one per purpose and named
// by a fixed label, so no purpose needs a secret of its own and no two purposes share a key. The
// labels in use (PLAN §18.2):
// - `gliagora/forms/ip-hash/v1`: hashed IP addresses for the form limits (src/lib/forms/client-ip.ts);
// - `gliagora/forms/address-hash/v1`: hashed email addresses for the limits of the forms that send
//   an email (src/lib/forms/rate-limit.ts);
// - `gliagora/data-requests/address/v1`: the address hash a data request keeps before it is
//   confirmed (src/lib/data-requests/address.ts);
// - `gliagora/members/signin-cookie/v1`: the sealed sign-in cookie (src/lib/members/seal.ts);
// - `gliagora/newsletter/inbox-cookie/v1`: the sealed cookie after the newsletter form
//   (src/lib/newsletter/cookie.ts).
// Changing PAYLOAD_SECRET changes every one of them (and signs editors out), which only resets the
// limits, cancels sign-ins in progress, makes old unconfirmed requests unfindable and makes "Check
// your inbox" forget the address (the emailed links still work).

const cache = new Map<string, Buffer>()

/** The 32-byte key for `label`, derived from `secret`. */
export function derivedKey(secret: string, label: string): Buffer {
  if (secret === '') throw new Error('PAYLOAD_SECRET is not set.')
  const id = `${label}\u0000${secret}`
  let key = cache.get(id)
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, '', label, 32))
    // A handful of labels and, outside tests, one secret: the cache stays tiny.
    if (cache.size > 32) cache.clear()
    cache.set(id, key)
  }
  return key
}

/** HMAC-SHA256 (hex) of `value` with the key for `label`. */
export function keyedHash(secret: string, label: string, value: string): string {
  return createHmac('sha256', derivedKey(secret, label)).update(value).digest('hex')
}
