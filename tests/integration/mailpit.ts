import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { promisify } from 'node:util'

const run = promisify(execFile)

// A throwaway Mailpit container for the email tests: the same image as `docker compose --profile
// mail up -d mailpit` (compose.yaml), on free ports of this computer only. It keeps every message
// and sends nothing on; the tests read the messages through its API and then stop it (the
// container removes itself).

/** The image pinned in compose.yaml, so the tests and local development use the same one. */
export const MAILPIT_IMAGE = (() => {
  const match = /image:\s*(axllent\/mailpit\S+)/.exec(readFileSync('compose.yaml', 'utf8'))
  if (!match?.[1]) throw new Error('compose.yaml has no Mailpit image')
  return match[1]
})()

export type MailpitAddress = { Name: string; Address: string }
export type MailpitSummary = { ID: string; To: MailpitAddress[]; Subject: string }
export type MailpitMessage = MailpitSummary & {
  From: MailpitAddress
  ReplyTo: MailpitAddress[]
  Text: string
  HTML: string
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}'])
    return true
  } catch {
    return false
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('port')),
      )
    })
  })
}

export async function startMailpit() {
  const smtpPort = await freePort()
  const apiPort = await freePort()
  const name = `gliagora-test-mailpit-${randomBytes(4).toString('hex')}`
  await run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--publish',
    `127.0.0.1:${smtpPort}:1025`,
    '--publish',
    `127.0.0.1:${apiPort}:8025`,
    '--env',
    'MP_DISABLE_VERSION_CHECK=true',
    MAILPIT_IMAGE,
  ])
  const api = `http://127.0.0.1:${apiPort}`
  let stopped = false
  const mailpit = {
    name,
    smtpPort,
    async messages(): Promise<MailpitSummary[]> {
      const response = await fetch(`${api}/api/v1/messages?limit=500`)
      return ((await response.json()) as { messages: MailpitSummary[] }).messages
    },
    async message(id: string): Promise<MailpitMessage> {
      return (await (await fetch(`${api}/api/v1/message/${id}`)).json()) as MailpitMessage
    },
    async headers(id: string): Promise<Record<string, string[]>> {
      return (await (await fetch(`${api}/api/v1/message/${id}/headers`)).json()) as Record<
        string,
        string[]
      >
    },
    /** The one message to `address`, read in full. */
    async to(address: string): Promise<MailpitMessage[]> {
      const found = (await mailpit.messages()).filter((m) =>
        m.To.some((to) => to.Address === address),
      )
      return Promise.all(found.map((m) => mailpit.message(m.ID)))
    },
    /** Stops (and so removes) this container only. */
    async stop() {
      if (stopped) return
      stopped = true
      await run('docker', ['stop', name]).catch(() => {})
    },
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${api}/readyz`)).ok) return mailpit
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  await mailpit.stop()
  throw new Error('Mailpit did not start')
}

export type Mailpit = Awaited<ReturnType<typeof startMailpit>>
