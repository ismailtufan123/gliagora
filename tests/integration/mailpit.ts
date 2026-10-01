import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { promisify } from 'node:util'

const run = promisify(execFile)

// A throwaway Mailpit for the email tests, on free ports of this computer only: a container of the
// same image as `docker compose --profile mail up -d mailpit` (compose.yaml), or, where Docker is
// not available (M4b), the Mailpit program named by MAILPIT_BIN, started as a process of its own.
// It keeps every message (in memory or a temporary file of its own, so each run starts empty) and
// sends nothing on; the tests read the messages through its API and then stop it (the container
// removes itself; the process is ended).

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

/** The Mailpit program named by MAILPIT_BIN, if it exists. */
export function mailpitBinary(): string | null {
  const file = process.env.MAILPIT_BIN?.trim()
  return file && existsSync(file) ? file : null
}

/** Whether the email tests can start a Mailpit: with Docker, or with MAILPIT_BIN. */
export async function mailpitAvailable(): Promise<boolean> {
  return (await dockerAvailable()) || mailpitBinary() !== null
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

/** Starts the Mailpit program as a child process; it is ended by `stop()`. */
function startBinary(file: string, smtpPort: number, apiPort: number): ChildProcess {
  const child = spawn(
    file,
    ['--smtp', `127.0.0.1:${smtpPort}`, '--listen', `127.0.0.1:${apiPort}`],
    {
      env: { ...process.env, MP_DISABLE_VERSION_CHECK: 'true', MP_DATABASE: '' },
      stdio: 'ignore',
    },
  )
  child.unref()
  return child
}

export async function startMailpit() {
  const smtpPort = await freePort()
  const apiPort = await freePort()
  const name = `gliagora-test-mailpit-${randomBytes(4).toString('hex')}`
  let child: ChildProcess | null = null
  if (await dockerAvailable()) {
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
  } else {
    const file = mailpitBinary()
    if (!file) throw new Error('Neither Docker nor MAILPIT_BIN is available for Mailpit')
    child = startBinary(file, smtpPort, apiPort)
  }
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
    /** Stops (and so removes) this container, or ends this process, only. */
    async stop() {
      if (stopped) return
      stopped = true
      if (child) {
        const running = child
        if (running.exitCode !== null || running.signalCode !== null) return
        await new Promise<void>((resolve) => {
          running.once('exit', () => resolve())
          running.kill('SIGTERM')
        })
        return
      }
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
