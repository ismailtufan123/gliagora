import { keyedHash } from '@/lib/keys'
import { normaliseEmail } from '@/lib/members/email-address'

// The address hash an unconfirmed data request keeps (M4b, D49; the M4b design §6, §7.8): the
// record shows that a request of that kind arrived on that date without holding the address, and
// the technical administrator can still find it from an address the person gives (the admin's
// `emailHash` filter; deploy/README.md has the command). HMAC-SHA256 with a key derived from
// PAYLOAD_SECRET under its own label (src/lib/keys.ts), of the address as stored (lowercased),
// not of the canonical form the limits use: `name+tag@` is another address in law.

/** The `emailHash` of a request sent from `email`, or null if it is not an email address. */
export function requestAddressHash(email: string, secret: string): string | null {
  const address = normaliseEmail(email)
  return address ? keyedHash(secret, 'gliagora/data-requests/address/v1', address) : null
}
