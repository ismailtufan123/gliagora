import { expect, test } from '@playwright/test'

// What listmonk holds, read by the end-to-end tests of Glia Notes (M2, D50) through its API, as
// the app's own API user: in CI the listmonk the app under test uses (127.0.0.1:9000, its token in
// LISTMONK_API_TOKEN); locally one started with `pnpm listmonk:setup` and the program, with the same
// LISTMONK_URL and LISTMONK_API_TOKEN for the app and the tests. Fake addresses only.

export const listmonkUrl = process.env.LISTMONK_URL?.replace(/\/+$/, '')
const token = process.env.LISTMONK_API_TOKEN
const user = process.env.LISTMONK_API_USER || 'gliagora-app'

/** Skips locally without listmonk; CI always has it, so there it fails instead. */
export function needsListmonk() {
  test.skip(
    !(listmonkUrl && token) && !process.env.CI,
    'needs listmonk (LISTMONK_URL and LISTMONK_API_TOKEN, for the app and the tests)',
  )
  expect(listmonkUrl, 'LISTMONK_URL').toBeTruthy()
  expect(token, 'LISTMONK_API_TOKEN').toBeTruthy()
}

export type HeldSubscriber = {
  id: number
  uuid: string
  email: string
  lists: { name: string; subscription_status: string }[]
}

/** The subscribers listmonk shows the app with exactly this address (none, or one). */
export async function subscribersWith(email: string): Promise<HeldSubscriber[]> {
  const pattern = `^${email.replace(/[\x20-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g, '\\$&')}$`
  const response = await fetch(
    `${listmonkUrl}/api/subscribers?per_page=50&search=${encodeURIComponent(pattern)}`,
    { headers: { Authorization: `token ${user}:${token}` } },
  )
  expect(response.ok, `listmonk: ${response.status}`).toBe(true)
  const { data } = (await response.json()) as { data: { results: HeldSubscriber[] | null } }
  return (data.results ?? []).filter((row) => row.email === email)
}
