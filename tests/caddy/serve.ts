// The production Caddyfile (deploy/Caddyfile) run in front of an app, for the end-to-end tests of
// the M2 state and of the rate limits (tests/e2e/m2.spec.ts, tests/e2e/rate-limits.spec.ts;
// playwright.config.ts starts four of these):
//
//   CADDY_BIN=/path/to/caddy node tests/caddy/serve.ts <stage> <app host:port> <https port> <http port> [trust]
//
// `stage` is the site's stage Caddy is given (SITE_STAGE: private or m2). Caddy then routes, asks
// for the site-wide password and opens the M2 state's pages exactly as on the server, at
// https://localhost:<https port> (and www.localhost), with its own local certificate authority and
// the test's password (tests/fixtures/caddy/admin-auth.caddy). CADDY_BIN is the Caddy of the
// production image (CI copies it out of the image deploy/compose.prod.yml pins) or the same build
// on this computer (deploy/caddy-image: the official Caddy does not know `rate_limit`). It runs
// without root and without the server's folders: everything it writes goes into a temporary
// folder, deleted when it stops (SIGTERM or SIGINT) or fails to start, but its access log and its
// own log, which the tests read (`accessLogOf`, `ownLogOf`, deleted with it).
// `trust` makes it take a visitor's address from X-Forwarded-For when the request comes from this
// computer, so that each test of the rate limits can be a visitor of its own; the server trusts
// no proxy, and neither do the other Caddies of the tests.
// M2_PUBLIC_CADDY_TEXT, when set, stands in for deploy/caddy/m2-public.caddy (a list that opens
// more than the app's own, as after a rollback: playwright.config.ts writes it).
//
// The Caddyfile is adapted by plain text replacements, each of which must match exactly as often
// as expected, so that a change of the Caddyfile's shape fails the unit test
// (tests/caddy/serve.test.ts) instead of testing something else. Node's modules only, so `node`,
// Playwright and Vitest load this file as it is.
import { spawn } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const CADDYFILE = new URL('../../deploy/Caddyfile', import.meta.url)
export const M2_PUBLIC_CADDY = new URL('../../deploy/caddy/m2-public.caddy', import.meta.url)
export const ADMIN_AUTH_FIXTURE = new URL('../fixtures/caddy/admin-auth.caddy', import.meta.url)

/**
 * The user and password of the test's site-wide password (tests/fixtures/caddy/admin-auth.caddy,
 * a bcrypt hash of it): test-only values, not a secret, like the fake providers' key.
 */
export const TEST_AUTH = { username: 'editor', password: 'caddy-test-only' } as const

/**
 * Values of SITE_STAGE that are no stage, though they look like one or like a stage with something
 * after it: the app shows the private stage with each (tests/caddy/serve.test.ts) and Caddy refuses
 * to start with each (tests/e2e/m2.spec.ts). Compose passes a quoted value from .env as it is
 * written, and an unquoted one with a tab or a second word after it.
 */
export const NOT_STAGES = [
  'M2',
  ' m2',
  'm2 ',
  'm2\t',
  'm2\n',
  'm2 x',
  'm2\t# go public',
  '"m2"',
  'private ',
  'public',
  'stage-m2',
] as const

export type Replacement = { from: string; to: string; count: number }

/** Replaces each text exactly `count` times, or throws: the file did not have the expected shape. */
export function replaceExactly(text: string, replacements: readonly Replacement[]): string {
  let result = text
  for (const { from, to, count } of replacements) {
    const found = result.split(from).length - 1
    if (found !== count) {
      throw new Error(`Expected ${count} × ${JSON.stringify(from)}, found ${found}`)
    }
    result = result.split(from).join(to)
  }
  return result
}

export type Setup = {
  /** A folder of this test run's own, for the password and an empty basemap. */
  dir: string
  /** The app's address, host:port. */
  app: string
  /** Caddy's port for plain HTTP (its redirect to HTTPS), above 1024. */
  httpPort: number
  /** Where the access log goes (in `dir` unless the tests read it: `accessLogOf`). */
  accessLog?: string
  /**
   * Takes the visitor's address from X-Forwarded-For on requests from this computer (the rate
   * limits' tests, each a visitor of its own). The server has no such line.
   */
  trustForwarded?: boolean
}

/** The access log of the Caddy at this HTTPS port, which tests/e2e/m2.spec.ts reads. */
export const accessLogOf = (httpsPort: number) =>
  path.join(tmpdir(), `gliagora-caddy-${httpsPort}-access.log`)

/** Caddy's own log (all of its stderr) at this HTTPS port, which the rate limits' tests read. */
export const ownLogOf = (httpsPort: number) =>
  path.join(tmpdir(), `gliagora-caddy-${httpsPort}-own.log`)

/** What changes in deploy/Caddyfile, each with how often it occurs there. */
export function caddyfileReplacements({
  dir,
  app,
  httpPort,
  accessLog = `${dir}/access.log`,
  trustForwarded = false,
}: Setup): Replacement[] {
  if (/\s/.test(dir) || /\s/.test(accessLog)) {
    throw new Error('The folder must not contain spaces (a Caddyfile token).')
  }
  return [
    // Global options: no admin endpoint, no root certificate put into this computer's trust
    // store, only this computer's address, and a port without root for the redirect to HTTPS.
    {
      from: '{\n\tlog default {',
      to: `{\n\tadmin off\n\tskip_install_trust\n\tdefault_bind 127.0.0.1\n\thttp_port ${httpPort}\n\tlog default {`,
      count: 1,
    },
    // For the rate limits' tests also the visitor's address from X-Forwarded-For, in the server
    // options the Caddyfile has.
    {
      from: '\tservers {\n\t\t0rtt off\n\t}\n',
      to: `\tservers {\n\t\t0rtt off\n${
        trustForwarded ? '\t\ttrusted_proxies static 127.0.0.1/32\n' : ''
      }\t}\n`,
      count: 1,
    },
    // The basemap, the admin and the catch-all.
    { from: 'import /etc/caddy/admin-auth.caddy', to: `import ${dir}/admin-auth.caddy`, count: 3 },
    { from: 'import /etc/caddy/m2-public.caddy', to: `import ${dir}/m2-public.caddy`, count: 1 },
    // The health check, the admin and the catch-all.
    { from: 'reverse_proxy app:3000', to: `reverse_proxy ${app}`, count: 3 },
    {
      from: 'output file /var/log/caddy/access.log {',
      to: `output file ${accessLog} {`,
      count: 1,
    },
    { from: 'root * /srv/basemap', to: `root * ${dir}/basemap`, count: 1 },
  ]
}

/** What changes in deploy/caddy/m2-public.caddy: the app's address, in each of its handles. */
export function publicCaddyReplacements(text: string, app: string): Replacement[] {
  const handles = text.match(/^handle @/gm)?.length ?? 0
  return [{ from: 'reverse_proxy app:3000', to: `reverse_proxy ${app}`, count: handles }]
}

/** The three files Caddy reads in the test, from the repository's (or the list given). */
export function adaptedFiles(
  setup: Setup,
  publicCaddy: string = readFileSync(M2_PUBLIC_CADDY, 'utf8'),
) {
  return {
    caddyfile: replaceExactly(readFileSync(CADDYFILE, 'utf8'), caddyfileReplacements(setup)),
    publicCaddy: replaceExactly(publicCaddy, publicCaddyReplacements(publicCaddy, setup.app)),
    adminAuth: readFileSync(ADMIN_AUTH_FIXTURE, 'utf8'),
  }
}

export type TestCaddy = {
  stage: 'private' | 'm2'
  /** With the list of every text approved in place of the repository's (the `wide` Caddy). */
  allApproved: boolean
  /** The app it stands in front of, host:port. */
  app: string
  httpsPort: number
  httpPort: number
  /** Its address, which the browser opens. */
  url: string
  /** Its access log (removed when it stops). */
  accessLog: string
  /** Its own log: everything Caddy writes to stderr (removed when it stops). */
  ownLog: string
  /** Whether it takes a visitor's address from X-Forwarded-For (only the `limits` Caddy). */
  trustForwarded: boolean
}

/**
 * The Caddies of the end-to-end tests (playwright.config.ts), from the environment. For the M2
 * state (tests/e2e/m2.spec.ts): `m2` with SITE_STAGE=m2 in front of the app at M2_APP_URL (started
 * with SITE_STAGE=m2); `wide`, the same with a list of public addresses that opens every text,
 * also those the app still holds as drafts (as after a rollback, or a text taken back); `private`
 * with the private stage in front of the app under test (`baseURL`). For the rate limits
 * (tests/e2e/rate-limits.spec.ts): `limits`, like `wide` (so it has private addresses and public
 * forms), where each test is a visitor of its own (`trustForwarded`), so that no test uses up
 * another's count. Their HTTPS ports are CADDY_M2_PORT, CADDY_WIDE_PORT, CADDY_PRIVATE_PORT and
 * CADDY_LIMITS_PORT (8443, 8445, 8444 and 8446 by default), each with its port for plain HTTP 100
 * above. Null without CADDY_BIN and M2_APP_URL: the tests then skip.
 */
export function testCaddies(
  env: Record<string, string | undefined>,
  baseURL: string,
): Record<'m2' | 'wide' | 'private' | 'limits', TestCaddy> | null {
  if (!env.CADDY_BIN || !env.M2_APP_URL) return null
  const caddy = (
    stage: TestCaddy['stage'],
    app: string,
    port: string | undefined,
    fallback: number,
    allApproved = false,
    trustForwarded = false,
  ): TestCaddy => {
    const httpsPort = Number(port || fallback)
    // Caddy dials the app at this computer's IPv4 address, where the app listens in CI.
    const url = new URL(app)
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
    return {
      stage,
      allApproved,
      app: url.host,
      httpsPort,
      httpPort: httpsPort + 100,
      url: `https://localhost:${httpsPort}`,
      accessLog: accessLogOf(httpsPort),
      ownLog: ownLogOf(httpsPort),
      trustForwarded,
    }
  }
  return {
    m2: caddy('m2', env.M2_APP_URL, env.CADDY_M2_PORT, 8443),
    wide: caddy('m2', env.M2_APP_URL, env.CADDY_WIDE_PORT, 8445, true),
    private: caddy('private', baseURL, env.CADDY_PRIVATE_PORT, 8444),
    limits: caddy('m2', env.M2_APP_URL, env.CADDY_LIMITS_PORT, 8446, true, true),
  }
}

/** Starts Caddy as the command line says, until it is stopped. */
function main() {
  const [stage, app, httpsPort, httpPort, trust] = process.argv.slice(2)
  const caddy = process.env.CADDY_BIN
  if (
    !stage ||
    !app ||
    !/^\d+$/.test(httpsPort ?? '') ||
    !/^\d+$/.test(httpPort ?? '') ||
    !caddy ||
    (trust !== undefined && trust !== 'trust')
  ) {
    console.error(
      'Usage: CADDY_BIN=… node tests/caddy/serve.ts <stage> <app host:port> <https port> <http port> [trust]',
    )
    process.exit(2)
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'gliagora-caddy-'))
  const accessLog = accessLogOf(Number(httpsPort))
  const ownLog = ownLogOf(Number(httpsPort))
  // Also when the setup below throws or Caddy cannot start: Node emits `exit` then too.
  process.on('exit', () => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(accessLog, { force: true })
    rmSync(ownLog, { force: true })
  })
  const files = adaptedFiles(
    { dir, app, httpPort: Number(httpPort), accessLog, trustForwarded: trust === 'trust' },
    process.env.M2_PUBLIC_CADDY_TEXT || undefined,
  )
  writeFileSync(ownLog, '')
  writeFileSync(path.join(dir, 'Caddyfile'), files.caddyfile)
  writeFileSync(path.join(dir, 'm2-public.caddy'), files.publicCaddy)
  writeFileSync(path.join(dir, 'admin-auth.caddy'), files.adminAuth)
  mkdirSync(path.join(dir, 'basemap'))

  const child = spawn(
    caddy,
    ['run', '--config', path.join(dir, 'Caddyfile'), '--adapter', 'caddyfile'],
    {
      stdio: ['ignore', 'inherit', 'pipe'],
      // Only what Caddy needs (Next.js's types require NODE_ENV in any environment).
      env: {
        NODE_ENV: 'test',
        PATH: process.env.PATH ?? '',
        SITE_DOMAIN: `localhost:${httpsPort}`,
        SITE_STAGE: stage,
        // Caddy's certificates and its own settings stay in the temporary folder.
        XDG_DATA_HOME: path.join(dir, 'data'),
        XDG_CONFIG_HOME: path.join(dir, 'config'),
        HOME: dir,
      },
    },
  )
  // Caddy logs every step of its start at the info level: only warnings and errors are shown.
  // Its own log, whole, goes into a file for the tests (`ownLogOf`).
  let rest = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    appendFileSync(ownLog, chunk)
    const lines = (rest + chunk).split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) if (line && !line.includes('"level":"info"')) console.error(line)
  })
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => child.kill(signal))
  }
  child.on('error', (error: NodeJS.ErrnoException) => {
    console.error(`Cannot start Caddy at CADDY_BIN (${error.code ?? error.name})`)
    process.exit(1)
  })
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}

if (import.meta.main) main()
