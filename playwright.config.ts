import { existsSync } from 'node:fs'

import { defineConfig, devices } from '@playwright/test'

import { m2PublicCaddy } from './src/scripts/caddy-public-file'
import { testCaddies } from './tests/caddy/serve'

// End-to-end tests (PLAN §17.2): accessibility (axe), keyboard paths and HTTP behaviour of the
// public pages. They run against a running app: in CI the production Docker image, locally the
// server from `pnpm build && pnpm start` (with the database from compose.yaml running).
//
// The settings the tests read (E2E_EDITOR_PASSWORD, E2E_MEMBER_TOKEN, MAILPIT_URL,
// AUTH_TEST_ISSUER, CADDY_BIN, M2_APP_URL and the Caddies' ports) may come from .env, as for
// `pnpm test:db`; what the environment sets wins.
if (existsSync('.env')) process.loadEnvFile('.env')

/**
 * The fake Google and ORCID (tests/fake-oidc/server.ts), where the app under test uses them
 * (AUTH_TEST_ISSUER, the same value as the app's): started here unless one is running already. The
 * app and the browser both reach it at that address, on this computer (in CI the app runs on the
 * host's network).
 */
const testIssuer = process.env.AUTH_TEST_ISSUER?.replace(/\/+$/, '')

/**
 * Tests that delete data others may be reading (a confirmed data request's deletion, deleting an
 * account): they run in a project of their own, after every other test has finished, so a test that
 * counts or samples records (access.spec.ts) never sees them change midway.
 */
const DESTRUCTIVE = [/\/data-requests\.spec\.ts$/, /\/account-delete\.spec\.ts$/]

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

/**
 * The M2 state behind the production Caddyfile (D41, D50; tests/e2e/m2.spec.ts, its own project):
 * with CADDY_BIN (the production image's Caddy, or the same version) and M2_APP_URL (an app started
 * with SITE_STAGE=m2 beside the app under test), Playwright starts three Caddies
 * (tests/caddy/serve.ts): two in the M2 state in front of that app, one with the repository's list
 * of public addresses, which the project `m2` opens, and one with a list that opens every text
 * (`wide`), and one in the private stage in front of the app under test. Without them the project
 * skips. The M2 Caddies are ready when they answer, without the app behind them (its own
 * readiness is checked by m2.spec.ts, which fails with a clear message without it), so that the
 * other projects never wait for an app they do not need.
 */
const M2 = /\/m2\.spec\.ts$/
const caddies = testCaddies(process.env, baseURL)

export default defineConfig({
  testDir: './tests/e2e',
  // Signs in once as the test editor, for the tests that need it (tests/e2e/editor.ts).
  globalSetup: './tests/e2e/editor.ts',
  fullyParallel: true,
  // GitHub's runners for this private repository have 2 processors, where Playwright's default is
  // one worker; the tests mostly wait for the app and the browser, so two run side by side and the
  // run costs fewer Actions minutes (D46). Locally, Playwright's default (half the processors).
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL,
    trace: 'off',
    // A preinstalled Chromium can be used instead of `playwright install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: [
    ...(testIssuer
      ? [
          {
            command: 'node tests/fake-oidc/server.ts',
            url: `${testIssuer}/google/.well-known/openid-configuration`,
            reuseExistingServer: true,
            timeout: 20_000,
          },
        ]
      : []),
    ...Object.values(caddies ?? {}).map((caddy) => ({
      command: `node tests/caddy/serve.ts ${caddy.stage} ${caddy.app} ${caddy.httpsPort} ${caddy.httpPort}`,
      // The private stage through Caddy to the app under test, which every project needs; the M2
      // state at Caddy alone (a private page answers 401 without reaching the app).
      url: caddy.stage === 'private' ? `${caddy.url}/health/` : `${caddy.url}/en/jobs/`,
      env: caddy.allApproved
        ? { M2_PUBLIC_CADDY_TEXT: m2PublicCaddy(() => false) }
        : ({} as Record<string, string>),
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      // Caddy stops, and its temporary folder is deleted.
      gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 5_000 },
    })),
  ],
  projects: [
    // First: the test editor signs in at its address (tests/e2e/editor.ts).
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: [...DESTRUCTIVE, M2],
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: [...DESTRUCTIVE, M2] },
    {
      name: 'destructive',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: DESTRUCTIVE,
      dependencies: ['desktop', 'mobile'],
    },
    {
      name: 'm2',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // Caddy's own local certificate authority, which the browser does not know.
        ignoreHTTPSErrors: true,
        ...(caddies ? { baseURL: caddies.m2.url } : {}),
      },
      testMatch: M2,
      // After the desktop and phone projects, like `destructive`: its three Caddies, the M2 app
      // and its checks at three widths would otherwise compete with the admin's form-state
      // requests on CI's two processors.
      dependencies: ['desktop', 'mobile'],
    },
  ],
})
