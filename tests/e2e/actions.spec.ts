import { randomBytes } from 'node:crypto'

import { expect, request as newRequestContext, test } from '@playwright/test'

import { FAKE_QUEUE_NOTE } from '../../src/scripts/fake-queue-data'
import { editorHeaders, editorPassword } from './editor'
import { clientAddress } from './forms'

// Forwarded Server Actions are refused (M4b, D49; the M4b design §8). Next.js answers a Server
// Action posted to any page: when the page does not have it, it forwards the call, adding an
// `x-action-forwarded` header, to the page that does, straight to the app and so past Caddy. At M2,
// when some pages are public and the forms are not, a POST to a public page could otherwise run a
// form that is still behind the site-wide password, so every public form refuses a forwarded call
// (src/lib/forms/public-form.ts).
//
// Measured with Next.js 16.3.6: the forward goes to the page's path without its trailing slash,
// which this site redirects, so today the forwarded call never reaches the form and the page that
// received it answers `{}`. The refusal keeps it that way if Next.js changes; this test checks both:
// a real call of the "Suggest a listing" form, with a solved spam check, is posted to other pages
// (nothing may be stored, whatever Next.js does with it), and to the form's own page as a forwarded
// call arrives there (refused as a failed spam check). The same call sent normally is then taken,
// which shows that it was a valid suggestion all along. If a Next.js upgrade makes forwarding work
// and renames the header, the first part fails.

test.describe('forwarded Server Actions', () => {
  test.skip(({ isMobile }) => isMobile, 'sent from the desktop project only')

  test('the suggest form’s action is refused when another page forwards it, and stores nothing', async ({
    browser,
    request,
    baseURL,
  }) => {
    // A real call of the form's action, captured in the browser instead of being sent.
    const context = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': clientAddress() },
    })
    const page = await context.newPage()
    await page.goto('/en/suggest/')
    const captured = new Promise<{ headers: Record<string, string>; body: Buffer }>((resolve) => {
      void page.route('**/en/suggest/', async (route) => {
        const call = route.request()
        if (call.method() !== 'POST' || !(await call.headerValue('next-action'))) {
          return route.continue()
        }
        resolve({
          headers: await call.allHeaders(),
          body: call.postDataBuffer() ?? Buffer.alloc(0),
        })
        return route.abort()
      })
    })
    const url = `https://careers.example.org/e2e/forwarded-${randomBytes(6).toString('hex')}`
    await page.getByLabel('Address of the original page').fill(url)
    await page.getByLabel('A position').check()
    await page.getByLabel('Note (optional)').fill(`${FAKE_QUEUE_NOTE} Sent through another page.`)
    await page.getByRole('button', { name: 'Send suggestion' }).click()
    const call = await captured
    await context.close()
    expect(call.headers['next-action']).toMatch(/^[0-9a-f]{40,}$/)

    const send = (path: string, extra: Record<string, string> = {}) =>
      request.fetch(path, {
        method: 'POST',
        headers: { ...call.headers, ...extra },
        data: call.body,
        maxRedirects: 0,
      })

    await test.step('posted to other pages, it runs nowhere', async () => {
      for (const path of ['/en/about/', '/en/jobs/']) {
        const response = await send(path)
        expect.soft(response.headers()['x-action-redirect'], path).toBeUndefined()
        expect.soft(await response.text(), path).not.toContain('/en/suggest/sent/')
      }
    })

    await test.step('as a forwarded call, it is refused as a failed spam check', async () => {
      const response = await send('/en/suggest/', { 'x-action-forwarded': '1' })
      expect(response.status()).toBe(200)
      expect(response.headers()['x-action-redirect']).toBeUndefined()
      expect(await response.text()).toContain(
        'The spam check has expired or did not work. Please send the form again.',
      )
    })

    await test.step('sent normally, the same call is taken', async () => {
      const response = await send('/en/suggest/')
      expect(response.headers()['x-action-redirect']).toContain('/en/suggest/sent/')
    })

    await test.step('only that one suggestion was stored', async (step) => {
      step.skip(!editorPassword, 'needs the test editor (E2E_EDITOR_PASSWORD)')
      const editor = await newRequestContext.newContext({
        baseURL,
        extraHTTPHeaders: editorHeaders(),
      })
      const found = await editor.get(
        `/api/submissions/count/?where[url][equals]=${encodeURIComponent(url)}`,
      )
      expect(found.status()).toBe(200)
      expect(((await found.json()) as { totalDocs: number }).totalDocs).toBe(1)
      await editor.dispose()
    })
  })
})
