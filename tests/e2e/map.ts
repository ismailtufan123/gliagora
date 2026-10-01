import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

// Helpers for the map's tests (PLAN §14). On the server Caddy serves the basemap at /basemap/ and
// sets the Content-Security-Policy; the tests run against the app alone, so they do both here.

const FIXTURE = new URL('../fixtures/basemap/', import.meta.url)

/**
 * Serves tests/fixtures/basemap at /basemap/, with HTTP range requests as Caddy answers them (the
 * map reads the tiles in ranges). A font range the fixture leaves out (it has only the Latin ones)
 * is an empty glyph file: MapLibre then draws those letters itself.
 */
export async function serveBasemap(page: Page) {
  await page.route('**/basemap/**', async (route) => {
    const path = decodeURIComponent(
      new URL(route.request().url()).pathname.slice('/basemap/'.length),
    )
    let body: Buffer
    try {
      if (path.split('/').includes('..')) throw new Error('outside the fixture')
      body = await readFile(new URL(path, FIXTURE))
    } catch {
      if (path.endsWith('.pbf')) {
        await route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: '' })
      } else {
        await route.fulfill({ status: 404, body: '' })
      }
      return
    }
    const contentType = path.endsWith('.json')
      ? 'application/json'
      : path.endsWith('.png')
        ? 'image/png'
        : 'application/octet-stream'
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? '')
    if (!range) {
      await route.fulfill({ status: 200, contentType, body })
      return
    }
    const start = Number(range[1])
    const end = Math.min(range[2] ? Number(range[2]) : body.length - 1, body.length - 1)
    await route.fulfill({
      status: 206,
      contentType,
      headers: {
        'content-range': `bytes ${start}-${end}/${body.length}`,
        'accept-ranges': 'bytes',
      },
      body: body.subarray(start, end + 1),
    })
  })
}

/** The Content-Security-Policy Caddy sends with every page (deploy/Caddyfile). */
export async function siteCsp(): Promise<string> {
  const caddyfile = await readFile(new URL('../../deploy/Caddyfile', import.meta.url), 'utf8')
  const csp = /Content-Security-Policy "([^"]+)"/.exec(caddyfile)?.[1]
  if (!csp) throw new Error('No Content-Security-Policy in deploy/Caddyfile')
  return csp
}

/**
 * Pages answer with the site's Content-Security-Policy, as behind Caddy, and the browser's reports
 * of anything it blocked are kept (`cspViolations`).
 */
export async function withSiteCsp(page: Page) {
  const csp = await siteCsp()
  await page.route(
    (url) => url.pathname.startsWith('/en/'),
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': csp },
      })
    },
  )
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { cspViolations: string[] }).cspViolations = seen
    document.addEventListener('securitypolicyviolation', (event) =>
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`),
    )
  })
}

export const cspViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)
