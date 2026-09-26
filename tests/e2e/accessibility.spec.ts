import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { PAGES } from './pages'

// PLAN §17.2: every template × light/dark × desktop/mobile, 0 serious or critical axe issues,
// and no request to any other domain (PLAN §18: public pages load nothing from elsewhere).
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme })

    for (const page of PAGES) {
      test(`${page.name}: axe and own-origin only`, async ({ page: tab, baseURL }) => {
        const foreign: string[] = []
        const origin = new URL(baseURL!).origin
        tab.on('request', (request) => {
          const url = new URL(request.url())
          if (url.protocol.startsWith('http') && url.origin !== origin) foreign.push(url.href)
        })

        const response = await tab.goto(page.path, { waitUntil: 'networkidle' })
        expect(response?.status()).toBe('status' in page ? page.status : 200)

        const results = await new AxeBuilder({ page: tab })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        const serious = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        )
        expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([])
        expect(foreign).toEqual([])
      })
    }
  })
}
