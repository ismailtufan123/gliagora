import { USER_AGENT } from '@/lib/http'

import { type RorInstitution, fromRorRecord } from './record'

// ROR API v2 for single lookups between monthly dumps (PLAN §6.2). Only the ROR ID is sent.
export const ROR_API = 'https://api.ror.org/v2/organizations'

/** One institution from the ROR API, or null if ROR has no record with this ID. */
export async function fetchRorInstitution(
  rorId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RorInstitution | null> {
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': USER_AGENT }
  // Optional: a free ROR client ID raises the rate limit (https://ror.readme.io/docs/client-id).
  if (process.env.ROR_CLIENT_ID) headers['Client-Id'] = process.env.ROR_CLIENT_ID
  const response = await fetchImpl(`${ROR_API}/${encodeURIComponent(rorId)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`The ROR API answered ${response.status}`)
  return fromRorRecord(await response.json())
}
