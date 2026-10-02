import { expect } from '@playwright/test'

// The emails the app sent, read back from Mailpit (M4b): the local mail server that keeps every
// message (compose.yaml, profile "mail"; in CI a container on 127.0.0.1:8025). MAILPIT_URL is its
// address; the app must send to it (SMTP_HOST). Each test uses addresses of its own, so it finds
// its own messages among those of other tests.

export const mailpitUrl = process.env.MAILPIT_URL?.replace(/\/+$/, '')

type Summary = { ID: string; To: { Address: string }[]; Created: string }

/** The site's address in the emails, which the tests' app answers at BASE_URL instead. */
const SITE = 'https://gliagora.com'

/**
 * The messages to `address`, newest first. Compared without case, as Mailpit's search does (it
 * keeps each recipient as the app wrote it): the tests' addresses are random lower-case hex.
 */
async function messagesTo(address: string): Promise<Summary[]> {
  const query = encodeURIComponent(`to:"${address}"`)
  const response = await fetch(`${mailpitUrl}/api/v1/search?query=${query}&limit=50`)
  expect(response.ok, 'Mailpit search').toBe(true)
  const { messages } = (await response.json()) as { messages: Summary[] }
  const wanted = address.toLowerCase()
  return messages.filter((message) => message.To.some((to) => to.Address.toLowerCase() === wanted))
}

/**
 * The text of the newest email to `address`, waiting up to 20 seconds for it to arrive, with the
 * site's address rewritten to the app the tests run against (BASE_URL).
 */
export async function latestEmailTo(
  address: string,
  { count = 1 }: { count?: number } = {},
): Promise<{ id: string; subject: string; text: string }> {
  let found: Summary[] = []
  await expect
    .poll(
      async () => {
        found = await messagesTo(address)
        return found.length
      },
      { timeout: 20_000, message: `an email to ${address}` },
    )
    .toBeGreaterThanOrEqual(count)
  const response = await fetch(`${mailpitUrl}/api/v1/message/${found[0]!.ID}`)
  const message = (await response.json()) as { Subject: string; Text: string }
  const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  return { id: found[0]!.ID, subject: message.Subject, text: message.Text.replaceAll(SITE, base) }
}

/** The headers of a message (`latestEmailTo(…).id`), each with its values. */
export async function emailHeaders(id: string): Promise<Record<string, string[]>> {
  const response = await fetch(`${mailpitUrl}/api/v1/message/${id}/headers`)
  expect(response.ok, 'Mailpit headers').toBe(true)
  return (await response.json()) as Record<string, string[]>
}

/** How many emails went to `address`. */
export async function emailCount(address: string): Promise<number> {
  return (await messagesTo(address)).length
}

/** The sign-in link in the newest email to `address`. */
export async function signInLinkTo(address: string, options?: { count?: number }) {
  const { text } = await latestEmailTo(address, options)
  const link = /https?:\/\/\S+\/en\/sign-in\/link\/\?token=[A-Za-z0-9_-]{43}/.exec(text)?.[0]
  expect(link, `a sign-in link in the email to ${address}`).toBeTruthy()
  return link!
}
