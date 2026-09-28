import { defineConfig, devices } from '@playwright/test'

// End-to-end tests (PLAN §17.2): accessibility (axe), keyboard paths and HTTP behaviour of the
// public pages. They run against a running app: in CI the production Docker image, locally the
// server from `pnpm build && pnpm start` (with the database from compose.yaml running).
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
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
