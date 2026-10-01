import { type Page, expect, test } from '@playwright/test'

import { cspViolations, serveBasemap, withSiteCsp } from './map'

// The world map (PLAN §14, §3.2 "Map"): our own basemap and MapLibre, under the site's
// Content-Security-Policy and with nothing from other domains; the list of institutions in view as
// the keyboard and screen-reader way in; the panel; and the page without WebGL or JavaScript.

const MAPLIBRE = /^\/map\/maplibre-gl\/[^/]+\/maplibre-gl(-shared|-worker)?\.mjs$/

const mapReady = (page: Page) =>
  expect(page.locator('.map-view')).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })

/** The paths the page requested, and any request to another origin. */
function watchRequests(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin
  const paths: string[] = []
  const foreign: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!url.protocol.startsWith('http')) return
    paths.push(url.pathname)
    if (url.origin !== origin) foreign.push(url.href)
  })
  return { paths, foreign }
}

test.describe('world map', () => {
  test('draws the institutions on our basemap under the site’s policy, with nothing from elsewhere', async ({
    page,
    baseURL,
  }) => {
    const requests = watchRequests(page, baseURL!)
    await withSiteCsp(page)
    await serveBasemap(page)
    await page.goto('/en/map/')
    await mapReady(page)
    // MapLibre, its worker and the basemap's tiles, fonts and sprites, all from our origin.
    await expect
      .poll(() => requests.paths.filter((path) => MAPLIBRE.test(path)).length)
      .toBeGreaterThanOrEqual(3)
    await expect
      .poll(() => requests.paths.some((path) => path.endsWith('/planet.pmtiles')))
      .toBe(true)
    await expect
      .poll(() => requests.paths.some((path) => /^\/basemap\/assets-\w+\/fonts\//.test(path)))
      .toBe(true)
    expect(requests.foreign).toEqual([])
    expect(await cspViolations(page)).toEqual([])
    // The credits stay on the map: OpenStreetMap's licence, Protomaps and MapLibre.
    const credits = page.locator('.maplibregl-ctrl-attrib-inner')
    await expect(
      credits.getByRole('link', { name: '© OpenStreetMap contributors' }),
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    await expect(credits.getByRole('link', { name: 'Protomaps' })).toBeAttached()
    await expect(credits.getByRole('link', { name: 'MapLibre' })).toBeAttached()
  })

  test('the list of institutions in view opens the panel; Esc closes it and gives focus back', async ({
    page,
  }) => {
    await serveBasemap(page)
    await page.goto('/en/map/')
    await mapReady(page)
    const list = page.locator('#map-list')
    await expect(list.getByRole('heading', { level: 2 })).toContainText('Institutions in view')
    const first = list.getByRole('button').first()
    const name = (await first.locator('span').first().textContent())!.trim()
    await first.click()

    const panel = page.getByRole('complementary', { name })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { level: 2, name })).toBeFocused()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    // Its open positions, each with its deadline, and the way to the list and to its page.
    const jobs = panel.locator('.map-panel-jobs > li')
    expect(await jobs.count()).toBeGreaterThan(0)
    await expect(jobs.first().getByRole('link')).toHaveAttribute('href', /^\/en\/jobs\/[^/?]+\/$/)
    await expect(jobs.first()).toContainText(/Closes|Rolling deadline|Open until filled/)
    await expect(panel.getByRole('link', { name: 'These positions in the list' })).toHaveAttribute(
      'href',
      /^\/en\/jobs\/\?institution=\w+$/,
    )
    await expect(panel.getByRole('link', { name: 'Institution page' })).toHaveAttribute(
      'href',
      /^\/en\/institutions\/[^/]+\/$/,
    )

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(first).toBeFocused()
  })

  test('“Skip the map” moves on to the list', async ({ page }) => {
    await page.goto('/en/map/')
    await mapReady(page)
    const skip = page.getByRole('link', { name: 'Skip the map' })
    await skip.focus()
    await expect(skip).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('#map-list')).toBeFocused()
  })

  test('without WebGL, the list stands in for the map and no map code loads', async ({
    page,
    baseURL,
  }) => {
    const requests = watchRequests(page, baseURL!)
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        kind: string,
        ...rest: unknown[]
      ) {
        if (kind.startsWith('webgl')) return null
        return (getContext as (...args: unknown[]) => unknown).call(this, kind, ...rest)
      } as typeof getContext
    })
    await page.goto('/en/map/')
    await expect(page.locator('.map-view')).toHaveAttribute('data-status', 'no-webgl')
    await expect(page.getByText('This browser cannot draw the map.')).toBeVisible()
    await expect(page.locator('#map-list li a').first()).toHaveAttribute(
      'href',
      /^\/en\/institutions\//,
    )
    expect(requests.paths.filter((path) => MAPLIBRE.test(path))).toEqual([])
  })

  test('the jobs list loads no map code', async ({ page, baseURL }) => {
    const requests = watchRequests(page, baseURL!)
    await page.goto('/en/jobs/', { waitUntil: 'networkidle' })
    expect(
      requests.paths.filter((path) => MAPLIBRE.test(path) || path.startsWith('/api/map/')),
    ).toEqual([])
  })
})

test.describe('world map without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('lists every institution with open positions, each linked to its page', async ({
    page,
    request,
  }) => {
    const data = (await (await request.get('/api/map/institutions/')).json()) as {
      features: unknown[]
    }
    await page.goto('/en/map/')
    const items = page.locator('#map-list li a')
    await expect(items).toHaveCount(data.features.length)
    await expect(items.first()).toHaveAttribute('href', /^\/en\/institutions\//)
    await expect(items.first()).toContainText(/\d+ open positions?/)
    // In <noscript>: browsers without JavaScript show it. (Playwright turns JavaScript off after
    // the page is parsed as if it were on, so the text is checked in the markup.)
    expect(await page.content()).toContain('<noscript><p>The map needs JavaScript.')
  })
})

test.describe('the map’s data', () => {
  test.skip(({ isMobile }) => isMobile, 'no browser involved')

  test('counts the same positions as the jobs list, for the same filters', async ({ request }) => {
    for (const query of ['', 'type=phd', 'country=DE', 'deadline=30d', 'q=astrocyte']) {
      const html = await (await request.get(`/en/jobs/?${query}`)).text()
      const matches = /(\d+) positions? match/.exec(html)?.[1] ?? '0'
      const map = (await (await request.get(`/api/map/institutions/?${query}`)).json()) as {
        total: number
        unmapped: number
      }
      expect(map.total + map.unmapped, `?${query}`).toBe(Number(matches))
    }
  })

  test('is GeoJSON, kept for 10 minutes', async ({ request }) => {
    const response = await request.get('/api/map/institutions/?type=phd')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/^application\/geo\+json/)
    expect(response.headers()['cache-control']).toBe('private, max-age=600')
    const json = (await response.json()) as {
      type: string
      features: { geometry: { coordinates: number[] }; properties: { jobs: number } }[]
    }
    expect(json.type).toBe('FeatureCollection')
    for (const feature of json.features) {
      expect(feature.properties.jobs).toBeGreaterThan(0)
      expect(feature.geometry.coordinates).toHaveLength(2)
    }
  })
})
