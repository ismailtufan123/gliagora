import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SaveNotice } from './SaveControl'

// The line that names the position signing in will save (SaveControl.tsx): the title in its own
// language and direction (WCAG 3.1.2), as on the Save control itself.

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const messages = (await import('../../../messages/en.json')).default
  return {
    getTranslations: async ({ namespace }: { namespace: string }) =>
      createTranslator({ locale: 'en', messages, namespace: namespace as 'signIn' }),
  }
})

const job = (title: string, originalLanguage: string) => ({
  id: 1,
  shortId: 'k3f9a',
  title,
  originalLanguage,
})

const render = async (...args: Parameters<typeof SaveNotice>) =>
  renderToStaticMarkup(await SaveNotice(...args))

describe('SaveNotice', () => {
  it('names the position in its own language', async () => {
    expect(await render({ job: job('Doktorand (m/w/d) Neurowissenschaften', 'de') })).toBe(
      '<p>After you sign in, we save this position for you: <strong class="wrap-anywhere" lang="de">Doktorand (m/w/d) Neurowissenschaften</strong></p>',
    )
  })

  it('and direction', async () => {
    expect(await render({ job: job('باحث ما بعد الدكتوراه', 'ar') })).toContain(
      '<strong class="wrap-anywhere" lang="ar" dir="rtl">باحث ما بعد الدكتوراه</strong>',
    )
  })

  it('leaves English as the page’s own', async () => {
    expect(await render({ job: job('PhD position', 'en') })).toContain(
      '<strong class="wrap-anywhere">PhD position</strong>',
    )
  })

  it('says so to a member who opened a Save link', async () => {
    expect(await render({ job: job('Doktorand', 'de'), signedIn: true })).toBe(
      '<p>You opened a link to save this position: <strong class="wrap-anywhere" lang="de">Doktorand</strong></p>',
    )
  })
})
