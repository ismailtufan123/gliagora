import { describe, expect, it, vi } from 'vitest'

import { memoryLimitStore } from './memory-limit-store'
import {
  LIMIT_RETENTION_MS,
  LIMIT_WINDOW_MS,
  type LimitBucket,
  type LimitStore,
  REPORT_LIMIT,
  SUGGESTIONS_PER_WINDOW,
  SUGGEST_LIMIT,
  admit,
} from './rate-limit'

const T0 = Date.parse('2026-09-28T10:00:00Z')
const MINUTE = 60_000
let answers = 0
const send = (
  store: LimitStore,
  ipHash: string,
  at: number,
  replayKey = `answer-${++answers}`,
  bucket: LimitBucket = SUGGEST_LIMIT,
) => admit(store, { bucket, ipHash, replayKey, now: new Date(at) })

describe('suggestion rate limit', () => {
  it('takes 5 suggestions an hour from one address and refuses the 6th', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) {
      expect(await send(store, 'ip-a', T0 + i * MINUTE)).toBe('accepted')
    }
    expect(await send(store, 'ip-a', T0 + 10 * MINUTE)).toBe('rate-limited')
    expect(await send(store, 'ip-a', T0 + 59 * MINUTE)).toBe('rate-limited')
  })

  it('counts the last hour, so the limit frees up as older suggestions leave the window', async () => {
    const store = memoryLimitStore()
    for (const minute of [0, 10, 20, 30, 40]) {
      expect(await send(store, 'ip-a', T0 + minute * MINUTE)).toBe('accepted')
    }
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS - 1)).toBe('rate-limited')
    // An hour after the first one, it no longer counts; the next place frees up ten minutes later.
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS)).toBe('accepted')
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS + 5 * MINUTE)).toBe('rate-limited')
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS + 10 * MINUTE)).toBe('accepted')
  })

  it('does not affect other addresses', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) await send(store, 'ip-a', T0 + i)
    expect(await send(store, 'ip-a', T0 + 10)).toBe('rate-limited')
    expect(await send(store, 'ip-b', T0 + 10)).toBe('accepted')
  })

  it('records nothing for a refused suggestion', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) await send(store, 'ip-a', T0 + i, `a${i}`)
    const before = store.rows.length
    expect(await send(store, 'ip-a', T0 + 10)).toBe('rate-limited')
    expect(await send(store, 'ip-b', T0 + 10, 'a0')).toBe('replayed')
    expect(store.rows.length).toBe(before)
  })

  it('takes exactly 5 of many suggestions sent at the same moment', async () => {
    const store = memoryLimitStore()
    const results = await Promise.all(Array.from({ length: 12 }, () => send(store, 'ip-a', T0)))
    expect(results.filter((result) => result === 'accepted')).toHaveLength(SUGGESTIONS_PER_WINDOW)
  })
})

describe('spam-check answers', () => {
  it('are used once, from any address', async () => {
    const store = memoryLimitStore()
    expect(await send(store, 'ip-a', T0, 'same-answer')).toBe('accepted')
    expect(await send(store, 'ip-a', T0 + 1, 'same-answer')).toBe('replayed')
    expect(await send(store, 'ip-b', T0 + 2, 'same-answer')).toBe('replayed')
  })

  it('are refused as reused before the address limit is looked at', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) await send(store, 'ip-a', T0 + i, `a${i}`)
    expect(await send(store, 'ip-a', T0 + 10, 'a0')).toBe('replayed')
  })
})

describe('clean-up (D34)', () => {
  it('deletes rows older than 24 hours when a suggestion is taken', async () => {
    const store = memoryLimitStore()
    await send(store, 'ip-a', T0)
    await send(store, 'ip-b', T0 + LIMIT_RETENTION_MS - MINUTE)
    await send(store, 'ip-c', T0 + LIMIT_RETENTION_MS + 1)
    expect(store.rows.map((row) => row.key)).not.toContain('ip:suggest:ip-a')
    expect(store.rows.map((row) => row.key)).toEqual(
      expect.arrayContaining(['ip:suggest:ip-b', 'ip:suggest:ip-c']),
    )
  })

  it('also deletes them when a suggestion is refused as rate-limited or replayed', async () => {
    for (const refusal of ['rate-limited', 'replayed'] as const) {
      const store = memoryLimitStore()
      await send(store, 'ip-old', T0, 'old-answer')
      // Five suggestions from one address just under 24 hours later fill its hour.
      const later = T0 + LIMIT_RETENTION_MS - 10 * MINUTE
      for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) {
        await send(store, 'ip-a', later + i * MINUTE, `later-${refusal}-${i}`)
      }
      expect(store.rows.map((row) => row.key)).toContain('ip:suggest:ip-old')
      // A day after the first suggestion, only refused requests arrive.
      const next = T0 + LIMIT_RETENTION_MS + MINUTE
      const outcome =
        refusal === 'rate-limited'
          ? await send(store, 'ip-a', next)
          : await send(store, 'ip-b', next, `later-${refusal}-0`)
      expect(outcome).toBe(refusal)
      expect(store.rows.map((row) => row.key)).not.toContain('ip:suggest:ip-old')
      expect(store.rows.map((row) => row.key)).not.toContain('altcha:old-answer')
    }
  })

  it('does not refuse a suggestion when the clean-up fails', async () => {
    const store = memoryLimitStore()
    store.purge = vi.fn(async () => {
      throw new Error('database is busy')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await send(store, 'ip-a', T0)).toBe('accepted')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Clean-up'), 'Error')
    error.mockRestore()
  })
})

describe('stored keys', () => {
  it('are the hashed address in the form’s bucket and the answer’s replay key', async () => {
    const store = memoryLimitStore()
    await send(store, 'hash-of-address', T0, 'hash-of-signature')
    await send(store, 'hash-of-address', T0, 'another-signature', REPORT_LIMIT)
    expect(store.rows.map((row) => row.key)).toEqual([
      'ip:suggest:hash-of-address',
      'altcha:hash-of-signature',
      'ip:report:hash-of-address',
      'altcha:another-signature',
    ])
  })
})

describe('buckets', () => {
  it('count each form apart: 5 reports an hour besides 5 suggestions from one address', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) await send(store, 'ip-a', T0 + i)
    expect(await send(store, 'ip-a', T0 + 10)).toBe('rate-limited')
    for (let i = 0; i < REPORT_LIMIT.perWindow; i++) {
      expect(await send(store, 'ip-a', T0 + 20 + i, undefined, REPORT_LIMIT)).toBe('accepted')
    }
    expect(await send(store, 'ip-a', T0 + 30, undefined, REPORT_LIMIT)).toBe('rate-limited')
  })

  it('share the used answers: an answer sends one form, whichever form it is', async () => {
    const store = memoryLimitStore()
    expect(await send(store, 'ip-a', T0, 'one-answer')).toBe('accepted')
    expect(await send(store, 'ip-a', T0 + 1, 'one-answer', REPORT_LIMIT)).toBe('replayed')
  })
})
