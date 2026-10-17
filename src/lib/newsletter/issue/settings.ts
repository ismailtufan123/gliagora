import { parseAddress } from '@/lib/email/settings'

// The settings of the newsletter builder (M11, D53), read per request: the image is built without
// the server's settings. Each problem names the variable, never its value.

type Env = Record<string, string | undefined>

/** The most seed addresses a test email goes to besides the editor (PLAN §13). */
export const SEED_ADDRESSES_MAX = 10

/**
 * The seed addresses every test email also goes to (GLIA_NOTES_SEED_ADDRESSES, PLAN §13: Gmail,
 * Outlook, Yahoo and a Turkish provider, to see how each shows the issue), separated by commas or
 * spaces, lowercased and without repeats; unusable entries and those beyond SEED_ADDRESSES_MAX
 * are left out with a problem. The operator's own test accounts, never subscribers.
 */
export function seedAddresses(env: Env = process.env): { addresses: string[]; problems: string[] } {
  const problems: string[] = []
  const addresses: string[] = []
  for (const entry of (env.GLIA_NOTES_SEED_ADDRESSES ?? '').split(/[\s,]+/).filter(Boolean)) {
    const parsed = parseAddress(entry)
    if (!parsed || parsed.address !== entry) {
      problems.push(
        'GLIA_NOTES_SEED_ADDRESSES has an entry that is not an email address; it is left out.',
      )
      continue
    }
    const address = parsed.address.toLowerCase()
    if (addresses.includes(address)) continue
    if (addresses.length >= SEED_ADDRESSES_MAX) {
      problems.push(
        `GLIA_NOTES_SEED_ADDRESSES has more than ${SEED_ADDRESSES_MAX} addresses; the rest are left out.`,
      )
      break
    }
    addresses.push(address)
  }
  return { addresses, problems }
}
