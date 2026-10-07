import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { siteStageSetting } from '../../src/lib/site-stage'
import {
  ADMIN_AUTH_FIXTURE,
  CADDYFILE,
  M2_PUBLIC_CADDY,
  NOT_STAGES,
  TEST_AUTH,
  accessLogOf,
  adaptedFiles,
  ownLogOf,
  caddyfileReplacements,
  publicCaddyReplacements,
  replaceExactly,
  testCaddies,
} from './serve'

// The Caddy of the end-to-end tests runs the production Caddyfile with as few changes as possible
// (tests/caddy/serve.ts). Each change must find exactly what it expects, so that the tests never
// run a Caddyfile that differs from the server's in some other way.

const SETUP = { dir: '/tmp/gliagora-caddy-test', app: '127.0.0.1:3001', httpPort: 8080 }

describe('the Caddy of the tests', () => {
  it('finds every text it replaces in the production files exactly as often as it expects', () => {
    const caddyfile = readFileSync(CADDYFILE, 'utf8')
    for (const { from, count } of caddyfileReplacements(SETUP)) {
      expect(caddyfile.split(from).length - 1, from).toBe(count)
    }
    const publicCaddy = readFileSync(M2_PUBLIC_CADDY, 'utf8')
    const [handles] = publicCaddyReplacements(publicCaddy, SETUP.app)
    expect(handles?.count).toBeGreaterThan(0)
    expect(publicCaddy.split('reverse_proxy app:3000').length - 1).toBe(handles?.count)
  })

  it('leaves nothing of the server’s folders or the app’s address on the server', () => {
    const files = adaptedFiles(SETUP)
    for (const text of [files.caddyfile, files.publicCaddy]) {
      expect(text).not.toMatch(/\/etc\/caddy|\/var\/log|\/srv\/|app:3000/)
    }
    expect(files.caddyfile).toContain('import /tmp/gliagora-caddy-test/admin-auth.caddy')
    expect(files.caddyfile).toContain('import /tmp/gliagora-caddy-test/m2-public.caddy')
    expect(files.caddyfile).toContain('reverse_proxy 127.0.0.1:3001')
    expect(files.caddyfile).toMatch(/^\{\n\tadmin off\n\tskip_install_trust\n/m)
    // The stage is still chosen by SITE_STAGE, as on the server.
    expect(files.caddyfile).toContain('import "stage-{$SITE_STAGE:private}"')
  })

  it('trusts X-Forwarded-For only where a test asks, for the rate limits’ own Caddy', () => {
    // The server trusts no proxy (tests/caddy/limits.test.ts), and neither do the other Caddies.
    expect(adaptedFiles(SETUP).caddyfile).not.toContain('trusted_proxies')
    expect(adaptedFiles({ ...SETUP, trustForwarded: true }).caddyfile).toContain(
      '\thttp_port 8080\n\tservers {\n\t\ttrusted_proxies static 127.0.0.1/32\n\t}\n\tlog default {',
    )
  })

  it('can stand a list of its own in for the repository’s, for the `wide` Caddy', () => {
    const list = readFileSync(M2_PUBLIC_CADDY, 'utf8').replace('path /en/about ', 'path /x ')
    const files = adaptedFiles(SETUP, list)
    expect(files.publicCaddy).toContain('path /x ')
    expect(files.publicCaddy).not.toContain('app:3000')
  })

  it('fails when a text is missing or found more often than expected', () => {
    expect(() => replaceExactly('a b a', [{ from: 'a', to: 'c', count: 1 }])).toThrow(
      /Expected 1 × "a", found 2/,
    )
    expect(() => replaceExactly('b', [{ from: 'a', to: 'c', count: 1 }])).toThrow(/found 0/)
    expect(replaceExactly('a b a', [{ from: 'a', to: 'c', count: 2 }])).toBe('c b c')
    expect(() => caddyfileReplacements({ ...SETUP, dir: '/tmp/with space' })).toThrow(/spaces/)
  })

  it('names values of SITE_STAGE that the app keeps private too, as Caddy refuses them', () => {
    // tests/e2e/m2.spec.ts checks that Caddy refuses to start with each.
    for (const value of NOT_STAGES) {
      expect(siteStageSetting({ SITE_STAGE: value }).stage, JSON.stringify(value)).toBe('private')
    }
  })

  it('asks for a test password of its own, never the server’s', () => {
    const auth = readFileSync(ADMIN_AUTH_FIXTURE, 'utf8')
    expect(auth).toMatch(
      new RegExp(
        `^basic_auth \\{\\n\\t${TEST_AUTH.username} \\$2a\\$04\\$[./A-Za-z0-9]{53}\\n\\}$`,
        'm',
      ),
    )
  })
})

describe('node tests/caddy/serve.ts', () => {
  /** Runs it with its temporary folders in a folder of the test's own, which it must leave empty. */
  function run(env: Record<string, string>) {
    const scratch = mkdtempSync(path.join(tmpdir(), 'serve-test-'))
    try {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./serve.ts', import.meta.url)), 'm2', '127.0.0.1:1', '1', '2'],
        {
          // Only what the script needs (Next.js's types require NODE_ENV in any environment).
          env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', TMPDIR: scratch, ...env },
          encoding: 'utf8',
        },
      )
      return { ...result, left: readdirSync(scratch) }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  it('says so and removes its folder when Caddy cannot start', () => {
    const result = run({ CADDY_BIN: '/nonexistent/caddy' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Cannot start Caddy at CADDY_BIN (ENOENT)')
    expect(result.left).toEqual([])
  })

  it('removes its folder when the files do not have the expected shape', () => {
    const result = run({ CADDY_BIN: '/bin/true', M2_PUBLIC_CADDY_TEXT: 'handle @x {\n}\n' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Expected 1 × "reverse_proxy app:3000", found 0/)
    expect(result.left).toEqual([])
  })
})

describe('testCaddies', () => {
  it('runs only with a Caddy and an app in the M2 state', () => {
    expect(testCaddies({}, 'http://localhost:3000')).toBeNull()
    expect(testCaddies({ CADDY_BIN: '/bin/caddy' }, 'http://localhost:3000')).toBeNull()
  })

  it('puts the Caddies in front of the apps, on ports of their own', () => {
    const caddies = testCaddies(
      { CADDY_BIN: '/bin/caddy', M2_APP_URL: 'http://127.0.0.1:3001', CADDY_PRIVATE_PORT: '9644' },
      'http://localhost:3000',
    )
    expect(caddies).toEqual({
      m2: {
        stage: 'm2',
        allApproved: false,
        app: '127.0.0.1:3001',
        httpsPort: 8443,
        httpPort: 8543,
        url: 'https://localhost:8443',
        accessLog: accessLogOf(8443),
        ownLog: ownLogOf(8443),
        trustForwarded: false,
      },
      wide: {
        stage: 'm2',
        allApproved: true,
        app: '127.0.0.1:3001',
        httpsPort: 8445,
        httpPort: 8545,
        url: 'https://localhost:8445',
        accessLog: accessLogOf(8445),
        ownLog: ownLogOf(8445),
        trustForwarded: false,
      },
      private: {
        stage: 'private',
        allApproved: false,
        app: '127.0.0.1:3000',
        httpsPort: 9644,
        httpPort: 9744,
        url: 'https://localhost:9644',
        accessLog: accessLogOf(9644),
        ownLog: ownLogOf(9644),
        trustForwarded: false,
      },
      // For the rate limits: like `wide`, and the only one where a test names its own address.
      limits: {
        stage: 'm2',
        allApproved: true,
        app: '127.0.0.1:3001',
        httpsPort: 8446,
        httpPort: 8546,
        url: 'https://localhost:8446',
        accessLog: accessLogOf(8446),
        ownLog: ownLogOf(8446),
        trustForwarded: true,
      },
    })
    const ports = Object.values(caddies!).flatMap((caddy) => [caddy.httpsPort, caddy.httpPort])
    expect(new Set(ports).size).toBe(ports.length)
  })
})
