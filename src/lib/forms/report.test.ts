import { randomInt } from 'node:crypto'

import { createChallenge } from 'altcha-lib/v1'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderContentFile } from '@/lib/markdown'
import type { ReportableJob } from '@/lib/reports/item'

import { ALTCHA_MAX_NUMBER, ALTCHA_TTL_MS } from './altcha'
import { memoryLimitStore } from './memory-limit-store'
import { REPORT_LIMIT, SUGGESTIONS_PER_WINDOW } from './rate-limit'
import { REPORT_LEGAL_LINKS, type ReportDependencies, handleReport, reportRecord } from './report'
import { handleSuggestion } from './suggest'

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'
const SECRET = 'test-only-payload-secret'
const IP = '203.0.113.78'

afterEach(() => {
  vi.restoreAllMocks()
})

/** A correct spam-check answer, as the solver in the browser sends it (see suggest.test.ts). */
async function answer() {
  const number = randomInt(ALTCHA_MAX_NUMBER)
  const { algorithm, challenge, salt, signature } = await createChallenge({
    hmacKey: KEY,
    algorithm: 'SHA-256',
    number,
    maxnumber: ALTCHA_MAX_NUMBER,
    expires: new Date(Date.now() + ALTCHA_TTL_MS),
  })
  return Buffer.from(JSON.stringify({ algorithm, challenge, number, salt, signature })).toString(
    'base64',
  )
}

async function form(fields: Record<string, string> = {}, { solve = true } = {}) {
  const data = new FormData()
  const all: Record<string, string> = {
    kind: 'wrong-fact',
    details: 'The deadline on the original posting is 14 November.',
    email: '',
    item: 'job:test1',
    locale: 'en',
    reference_code: '',
    ...fields,
  }
  if (solve && !('altcha' in fields)) all.altcha = await answer()
  for (const [name, value] of Object.entries(all)) data.set(name, value)
  return data
}

function dependencies(overrides: Partial<ReportDependencies> = {}) {
  const store = memoryLimitStore()
  const save = vi.fn(async () => {})
  const limits = vi.fn(async () => store)
  const deps: ReportDependencies = {
    altchaKey: KEY,
    secret: SECRET,
    headers: new Headers({ 'x-forwarded-for': IP }),
    now: new Date(),
    limits,
    save,
    ...overrides,
  }
  return { deps, store, save, limits }
}

describe('sending a report', () => {
  it('stores it with the item named in the form', async () => {
    const { deps, save, store } = dependencies()
    expect(await handleReport(await form(), deps)).toEqual({ kind: 'sent' })
    expect(save).toHaveBeenCalledWith({
      kind: 'wrong-fact',
      details: 'The deadline on the original posting is 14 November.',
      email: null,
      locale: 'en',
      item: { type: 'job', shortId: 'test1' },
    })
    // A hashed address in the report bucket and the used answer, never the address itself.
    expect(store.rows.map((row) => row.key)).toEqual([
      expect.stringMatching(/^ip:report:[0-9a-f]{64}$/),
      expect.stringMatching(/^altcha:[0-9a-f]{64}$/),
    ])
    expect(JSON.stringify(store.rows)).not.toContain(IP)
  })

  it('asks for an email address for a personal-rights request, storing nothing', async () => {
    const { deps, save, limits } = dependencies()
    const outcome = await handleReport(await form({ kind: 'personal-rights' }), deps)
    expect(outcome).toMatchObject({
      kind: 'invalid',
      status: 400,
      errors: { email: 'emailRequired' },
      values: { kind: 'personal-rights', item: 'job:test1' },
    })
    expect(save).not.toHaveBeenCalled()
    expect(limits).not.toHaveBeenCalled()
  })

  it('answers a filled-in hidden field as if it worked, and stores and counts nothing', async () => {
    const { deps, save, limits } = dependencies()
    const outcome = await handleReport(
      await form({ reference_code: 'https://spam.example.com' }, { solve: false }),
      deps,
    )
    expect(outcome).toEqual({ kind: 'sent' })
    expect(save).not.toHaveBeenCalled()
    expect(limits).not.toHaveBeenCalled()
  })

  it('asks for JavaScript when the spam check was not run', async () => {
    const { deps } = dependencies()
    expect(await handleReport(await form({}, { solve: false }), deps)).toMatchObject({
      kind: 'refused',
      status: 400,
      problem: 'needsJs',
    })
  })

  it('has its own limit: 5 reports an hour, besides the suggestions', async () => {
    const { deps, save } = dependencies()
    const suggestion = new FormData()
    for (const [name, value] of Object.entries({
      url: 'https://www.example.org/jobs/123',
      kind: 'position',
      locale: 'en',
    })) {
      suggestion.set(name, value)
    }
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) {
      suggestion.set('altcha', await answer())
      expect(await handleSuggestion(suggestion, deps as never)).toEqual({ kind: 'sent' })
    }
    for (let i = 0; i < REPORT_LIMIT.perWindow; i++) {
      expect(await handleReport(await form(), deps)).toEqual({ kind: 'sent' })
    }
    expect(await handleReport(await form(), deps)).toMatchObject({
      kind: 'refused',
      status: 429,
      problem: 'rateLimited',
    })
    expect(save).toHaveBeenCalledTimes(SUGGESTIONS_PER_WINDOW + REPORT_LIMIT.perWindow)
  })

  it('reports a database error with a reference and logs no personal data', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = Object.assign(new Error('insert failed: someone@example.org'), {
      code: '23505',
    })
    const { deps } = dependencies({ save: vi.fn(async () => Promise.reject(failure)) })
    const outcome = await handleReport(
      await form({ kind: 'personal-rights', email: 'someone@example.org' }),
      deps,
    )
    expect(outcome).toMatchObject({ kind: 'failed', status: 500 })
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).toContain('Report not saved')
    expect(logged).toContain('23505')
    for (const personal of ['someone@example.org', '14 November', IP]) {
      expect(logged).not.toContain(personal)
    }
  })
})

describe('the stored report', () => {
  const now = new Date('2026-09-28T10:00:00.000Z')
  const open: ReportableJob = {
    id: 7,
    title: 'PhD position in astrocyte–neuron signalling',
    slug: 'phd-position-in-astrocyte-neuron-signalling',
    shortId: 'test1',
    status: 'published',
    deadlineKind: 'rolling',
  }
  const data = {
    kind: 'closed' as const,
    details: 'Filled last week.',
    email: null,
    locale: 'en' as const,
    item: { type: 'job' as const, shortId: 'test1' },
  }

  it('links a public job, with the address of its page', async () => {
    const findJob = vi.fn(async () => open)
    expect(await reportRecord(data, findJob, now)).toEqual({
      kind: 'closed',
      details: 'Filled last week.',
      email: null,
      locale: 'en',
      job: 7,
      itemUrl: '/en/jobs/phd-position-in-astrocyte-neuron-signalling-test1/',
      status: 'new',
    })
    expect(findJob).toHaveBeenCalledWith('test1')
  })

  it('keeps the report without the item when the job is unknown, a draft or gone', async () => {
    for (const job of [
      null,
      { ...open, status: 'draft' as const },
      { ...open, status: 'withdrawn' as const, withdrawnAt: now.toISOString() },
    ]) {
      expect(await reportRecord(data, async () => job, now)).toMatchObject({
        job: null,
        itemUrl: null,
      })
    }
  })

  it('looks nothing up for a report without an item', async () => {
    const findJob = vi.fn(async () => open)
    expect(await reportRecord({ ...data, item: null }, findJob, now)).toMatchObject({ job: null })
    expect(findJob).not.toHaveBeenCalled()
  })
})

describe('links to the legal texts', () => {
  it('lead to headings that exist', () => {
    const pages: Record<string, string> = {
      '/en/legal/privacy/': renderContentFile('en/legal/privacy.md'),
      '/en/legal/takedown/': renderContentFile('en/legal/takedown.md'),
      '/tr/legal/kvkk-aydinlatma-metni/': renderContentFile('tr/legal/kvkk-aydinlatma-metni.md'),
    }
    for (const link of Object.values(REPORT_LEGAL_LINKS)) {
      const [path = '', id] = link.split('#')
      expect(pages[path], link).toBeDefined()
      if (id) expect(pages[path], link).toContain(`id="${id}"`)
    }
  })
})
