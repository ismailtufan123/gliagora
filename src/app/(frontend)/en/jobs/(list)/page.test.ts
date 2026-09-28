import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Page from './page'

// The jobs list when its data cannot be read (PLAN §7.5 "States"): the page draws the error state
// on the server, so it shows without JavaScript (error.tsx is drawn only in the browser). Pages
// that can be read are checked end to end (tests/e2e/jobs-list.spec.ts).

vi.mock('@/lib/records', () => ({
  jobsList: async () => {
    throw new Error('connection refused')
  },
  requestTime: () => new Date('2026-09-27T10:00:00Z'),
}))

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const messages = (await import('../../../../../../messages/en.json')).default
  return {
    setRequestLocale: () => {},
    getTranslations: async ({ namespace }: { namespace: string }) =>
      createTranslator({ locale: 'en', messages, namespace: namespace as 'jobs' }),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the jobs list when the database fails', () => {
  it('shows the error with a reference and a retry link, out of search engines', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ type: ['phd', 'msc'], q: '' }) }),
    )
    expect(html).toContain('<h1>The positions could not be loaded</h1>')
    const reference = html.match(/Reference: ([0-9a-f]{8})</)?.[1]
    expect(reference).toBeDefined()
    // The same reference is in the server's log, with the error.
    expect(log).toHaveBeenCalledWith(
      `Jobs list failed (reference ${reference}):`,
      expect.objectContaining({ message: 'connection refused' }),
    )
    // A plain link to the same list, so trying again needs no JavaScript.
    expect(html).toContain('<a href="/en/jobs/?type=msc,phd" class="button button-primary">')
    expect(html).toContain('<meta name="robots" content="noindex"/>')
    expect(html).toContain('role="alert"')
  })
})
