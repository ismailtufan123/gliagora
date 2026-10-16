import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { postingPatternProblem } from '@/lib/sources/kinds'

import { Sources, attentionReasons } from './Sources'

type Validate = (value: unknown, options: Record<string, unknown>) => unknown
type DataField = Field & {
  name: string
  validate?: Validate
  admin?: { condition?: (data: unknown, siblingData: unknown, ctx: unknown) => boolean }
}

function dataFields(fields: Field[]): DataField[] {
  return fields.flatMap((f) => {
    if (f.type === 'row' || f.type === 'collapsible') return dataFields(f.fields)
    return 'name' in f ? [f as DataField] : []
  })
}

const FIELDS = dataFields(Sources.fields)

/** The validation messages for `data`, by field, as Payload checks them on save. */
async function problems(data: Record<string, unknown>) {
  const result: Record<string, string> = {}
  const req = { t: (key: string) => key, payload: {} }
  for (const f of FIELDS) {
    if (!f.validate) continue
    if (f.admin?.condition && !f.admin.condition(data, data, {})) continue
    const message = await f.validate(data[f.name], { ...f, data, siblingData: data, req })
    if (message !== true) result[f.name] = message as string
  }
  return result
}

const base = {
  name: 'Example Institute vacancies',
  url: 'https://www.example.org/jobs/',
  schedule: 'daily',
  termsAutomation: 'not-stated',
}

describe('Sources: rules', () => {
  it('needs the pattern of postings for a list page', async () => {
    expect(await problems({ ...base, kind: 'page' })).toHaveProperty('postingPattern')
    expect(
      await problems({
        ...base,
        kind: 'page',
        postingPattern: '^https://www\\.example\\.org/jobs/\\d+$',
      }),
    ).toEqual({})
  })

  it('needs the API for an API source', async () => {
    expect(await problems({ ...base, kind: 'api' })).toHaveProperty('apiFormat')
    expect(await problems({ ...base, kind: 'api', apiFormat: 'greenhouse' })).toEqual({})
  })

  it('keeps a source whose terms forbid automated access manual', async () => {
    expect(await problems({ ...base, kind: 'rss', termsAutomation: 'forbids' })).toHaveProperty(
      'termsAutomation',
    )
    expect(await problems({ ...base, kind: 'manual', termsAutomation: 'forbids' })).toEqual({})
  })

  it('takes only full http(s) addresses', async () => {
    expect(await problems({ ...base, kind: 'manual', url: 'ftp://example.org/' })).toHaveProperty(
      'url',
    )
    expect(
      await problems({ ...base, kind: 'manual', termsUrl: 'example.org/terms' }),
    ).toHaveProperty('termsUrl')
  })
})

describe('postingPatternProblem', () => {
  it('takes an anchored regular expression', () => {
    expect(postingPatternProblem('^https://x\\.org/jobs/\\d+$')).toBeNull()
    expect(postingPatternProblem('https://x\\.org/jobs/')).toMatch(/Start the pattern with \^/)
    expect(postingPatternProblem('^https://x\\.org/(jobs$')).toMatch(/not a valid/)
  })
})

describe('Sources: what needs attention', () => {
  it('flags a monitored source that failed three runs in a row, that robots.txt refuses or whose terms changed', () => {
    expect(attentionReasons({ kind: 'rss', consecutiveFailures: 2 })).toEqual([])
    expect(attentionReasons({ kind: 'rss', consecutiveFailures: 3 })).toEqual([
      'its last 3 runs failed',
    ])
    expect(attentionReasons({ kind: 'page', robotsAllowed: false })).toEqual([
      'robots.txt does not allow it',
    ])
    expect(
      attentionReasons({ kind: 'api', termsChangedAt: '2026-10-16T04:00:00.000Z' }),
    ).toHaveLength(1)
    expect(attentionReasons({ kind: 'manual', consecutiveFailures: 5 })).toEqual([])
  })

  const [settle] = Sources.hooks?.beforeChange ?? []
  const change = (data: Record<string, unknown>, originalDoc: Record<string, unknown>) =>
    settle?.({ data, originalDoc, operation: 'update' } as never) as Record<string, unknown>

  it('sets the flag and its reason on save', () => {
    const data = change({}, { kind: 'rss', consecutiveFailures: 4 })
    expect(data).toMatchObject({ needsAttention: true, attentionReason: 'its last 4 runs failed' })
    expect(change({}, { kind: 'rss', consecutiveFailures: 0 })).toMatchObject({
      needsAttention: false,
      attentionReason: null,
    })
  })

  it('accepts the terms as they are now when an editor sets a new day of reading them', () => {
    const data = change(
      { termsCheckedAt: '2026-10-20T12:00:00.000Z' },
      {
        kind: 'page',
        termsCheckedAt: '2026-10-16T12:00:00.000Z',
        termsHash: 'new',
        termsReviewedHash: 'old',
        termsChangedAt: '2026-10-19T04:00:00.000Z',
      },
    )
    expect(data).toMatchObject({
      termsReviewedHash: 'new',
      termsChangedAt: null,
      needsAttention: false,
    })
  })

  it("records the day of an editor's look at a manual source", () => {
    const data = change({ lookedToday: true }, { kind: 'manual' })
    expect(data.lookedToday).toBe(false)
    expect(typeof data.lookedAt).toBe('string')
  })
})
