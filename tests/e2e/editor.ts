import { type FullConfig, expect, request } from '@playwright/test'

import { E2E_EDITOR_EMAIL } from '../../src/scripts/e2e-editor-account'

// The test editor (`pnpm e2e:editor`, src/scripts/e2e-editor.ts) that admin-api.spec.ts and
// access.spec.ts sign in with, using the password in E2E_EDITOR_PASSWORD. CI always has it; a local
// run without it skips what needs the editor.
//
// The whole run signs in once (playwright.config.ts: globalSetup) and shares the session: Payload
// keeps the sessions in the user record, and sign-ins at the same moment in parallel workers
// overwrite each other's session, which then answers as if signed out.

export const editorPassword = process.env.E2E_EDITOR_PASSWORD

export default async function signInOnce(config: FullConfig) {
  if (!editorPassword) return
  const context = await request.newContext({ baseURL: config.projects[0]?.use.baseURL })
  try {
    const response = await context.post('/api/users/login/', {
      data: { email: E2E_EDITOR_EMAIL, password: editorPassword },
    })
    if (response.ok()) {
      // Set here, the variable reaches every worker.
      process.env.E2E_EDITOR_TOKEN = ((await response.json()) as { token: string }).token
    } else {
      process.env.E2E_EDITOR_SIGN_IN = `answered ${response.status()}`
    }
  } catch (error) {
    process.env.E2E_EDITOR_SIGN_IN = `failed (${error instanceof Error ? error.name : 'error'})`
  } finally {
    await context.dispose()
  }
}

/** The header that makes a request the test editor's. */
export function editorHeaders(): { Authorization: string } {
  const token = process.env.E2E_EDITOR_TOKEN
  expect(
    token,
    `sign-in as the test editor (pnpm e2e:editor) ${process.env.E2E_EDITOR_SIGN_IN ?? 'did not run'}`,
  ).toBeTruthy()
  return { Authorization: `JWT ${token}` }
}
