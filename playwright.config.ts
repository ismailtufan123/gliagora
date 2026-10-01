import { existsSync } from 'node:fs'

import { defineConfig, devices } from '@playwright/test'

// End-to-end tests (PLAN §17.2): accessibility (axe), keyboard paths and HTTP behaviour of the
// public pages. They run against a running app: in CI the production Docker image, locally the
// server from `pnpm build && pnpm start` (with the database from compose.yaml running).
//
// The settings the tests read (E2E_EDITOR_PASSWORD, E2E_MEMBER_TOKEN, MAILPIT_URL,
// AUTH_TEST_ISSUER) may come from .env, as for `pnpm test:db`; what the environment sets wins.
if (existsSync('.env')) process.loadEnvFile('.env')

/**
 * The fake Google and ORCID (tests/fake-oidc/server.ts), where the app under test uses them
 * (AUTH_TEST_ISSUER, the same value as the app's): started here unless one is running already. The
 * app and the browser both reach it at that address, on this computer (in CI the app runs on the
 * host's network).
 */
const testIssuer = process.env.AUTH_TEST_ISSUER?.replace(/\/+$/, '')

/**
 * Tests that delete data others may be reading (none yet; the tests of a confirmed data request's
 * deletion and of deleting an account will be): they run in a project of their own, after every
 * other test has finished, so a test that counts or samples records (access.spec.ts) never sees
 * them change midway.
 */
const DESTRUCTIVE = [/\/data-requests\.spec\.ts$/, /\/account-delete\.spec\.ts$/]

export default defineConfig({
  testDir: './tests/e2e',
  // Signs in once as the test editor, for the tests that need it (tests/e2e/editor.ts).
  globalSetup: './tests/e2e/editor.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
    // A preinstalled Chromium can be used instead of `playwright install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: testIssuer
    ? {
        command: 'node tests/fake-oidc/server.ts',
        url: `${testIssuer}/google/.well-known/openid-configuration`,
        reuseExistingServer: true,
        timeout: 20_000,
      }
    : undefined,
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: DESTRUCTIVE,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: DESTRUCTIVE },
    {
      name: 'destructive',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: DESTRUCTIVE,
      dependencies: ['desktop', 'mobile'],
    },
  ],
})
