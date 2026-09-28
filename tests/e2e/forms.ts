import { randomBytes } from 'node:crypto'

import AxeBuilder from '@axe-core/playwright'
import { type Page, expect } from '@playwright/test'

// Helpers for the tests of the public forms (suggest.spec.ts, report.spec.ts).
//
// Each test that sends a form gets its own client address in X-Forwarded-For, so that parallel
// tests and reruns within the hour do not share a rate limit (5 an hour per address and form).
// That is harmless in production: Caddy replaces the header with the address that connected to
// it, and the app is reachable only through Caddy (src/lib/forms/client-ip.ts).

/** A random address in the IPv6 documentation range, a /64 of its own. */
export const clientAddress = () => {
  const [a, b, c, d] = [...randomBytes(8).subarray(0, 4)].map((byte) => byte.toString(16))
  return `2001:db8:${a}${b}:${c}${d}::1`
}

/** The error summary at the top of a form. */
export const summary = (page: Page) =>
  page.getByRole('alert').filter({ hasText: 'There is a problem' })

/** WCAG 1.4.12's text spacing, as in layout.spec.ts. */
export const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'

/** No serious or critical axe issues, in light and dark mode. */
export async function expectNoSeriousAxeIssues(page: Page) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(serious.map((v) => `${colorScheme}: ${v.id}: ${v.help}`)).toEqual([])
  }
}
