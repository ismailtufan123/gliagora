// The editor account the end-to-end tests sign in with (src/scripts/e2e-editor.ts adds it). An
// address on the reserved example.org domain, so never a real person; the password comes from
// E2E_EDITOR_PASSWORD. No imports, so Playwright can load the file as it is.
export const E2E_EDITOR_EMAIL = 'e2e-editor@example.org'
