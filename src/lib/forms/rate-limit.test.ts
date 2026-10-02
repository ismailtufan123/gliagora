import { describe, expect, it, vi } from 'vitest'

import { memoryLimitStore } from './memory-limit-store'
import {
  DAY_WINDOW_MS,
  EMAILS_PER_ADDRESS,
  EMAILS_SITE_WIDE,
  LIMIT_RETENTION_MS,
  LIMIT_WINDOW_MS,
  type Limit,
  type LimitBucket,
  type LimitStore,
  REPORT_LIMIT,
  SUGGESTIONS_PER_WINDOW,
  SUGGEST_LIMIT,
  admit,
  emailLimits,
  hashLimitAddress,
  ipLimit,
} from './rate-limit'

const T0 = Date.parse('2026-09-28T10:00:00Z')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
let answers = 0
const send = (
  store: LimitStore,
  ipHash: string,
  at: number,
  replayKey = `answer-${++answers}`,
  bucket: LimitBucket = SUGGEST_LIMIT,
) => admit(store, { keys: [ipLimit(bucket, ipHash)], replayKey, now: new Date(at) })

describe('suggestion rate limit', () => {
  it('takes 5 suggestions an hour from one address and refuses the 6th', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) {
      expect(await send(store, 'ip-a', T0 + i * MINUTE)).toBe('accepted')
    }
    expect(await send(store, 'ip-a', T0 + 10 * MINUTE)).toBe('rateLimited')
    expect(await send(store, 'ip-a', T0 + 59 * MINUTE)).toBe('rateLimited')
  })

  it('counts the last hour, so the limit frees up as older suggestions leave the window', async () => {
    const store = memoryLimitStore()
    for (const minute of [0, 10, 20, 30, 40]) {
      expect(await send(store, 'ip-a', T0 + minute * MINUTE)).toBe('accepted')
    }
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS - 1)).toBe('rateLimited')
    // An hour after the first one, it no longer counts; the next place frees up ten minutes later.
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS)).toBe('accepted')
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS + 5 * MINUTE)).toBe('rateLimited')
    expect(await send(store, 'ip-a', T0 + LIMIT_WINDOW_MS + 10 * MINUTE)).toBe('accepted')
  })

  it('does not affect other addresses', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) await send(store, 'ip-a', T0 + i)
    expect(await send(store, 'ip-a', T0 + 10)).toBe('rateLimited')
    expect(await send(store, 'ip-b', T0 + 10)).toBe('accepted')
  })

  it('records nothing for a refused suggestion', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < SUGGESTIONS_PER_WINDOW; i++) await send(store, 'ip-a', T0 + i, `a${i}`)
    const before = store.rows.length
    expect(await send(store, 'ip-a', T0 + 10)).toBe('rateLimited')
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
    for (const refusal of ['rateLimited', 'replayed'] as const) {
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
        refusal === 'rateLimited'
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
    expect(await send(store, 'ip-a', T0 + 10)).toBe('rateLimited')
    for (let i = 0; i < REPORT_LIMIT.perWindow; i++) {
      expect(await send(store, 'ip-a', T0 + 20 + i, undefined, REPORT_LIMIT)).toBe('accepted')
    }
    expect(await send(store, 'ip-a', T0 + 30, undefined, REPORT_LIMIT)).toBe('rateLimited')
  })

  it('share the used answers: an answer sends one form, whichever form it is', async () => {
    const store = memoryLimitStore()
    expect(await send(store, 'ip-a', T0, 'one-answer')).toBe('accepted')
    expect(await send(store, 'ip-a', T0 + 1, 'one-answer', REPORT_LIMIT)).toBe('replayed')
  })
})

describe('several limits (M4b)', () => {
  const SECRET = 'test-only-payload-secret'
  const at = (ms: number) => new Date(T0 + ms)
  const mail = (store: LimitStore, address: string, ip: string, ms: number, replayKey?: string) =>
    admit(store, {
      keys: [
        ipLimit({ name: 'signin', perWindow: 10 }, ip),
        ...emailLimits(hashLimitAddress(address, SECRET)),
      ],
      replayKey: replayKey ?? `answer-${++answers}`,
      now: at(ms),
    })

  it('gives one address 3 emails an hour and 5 a day, from any IP address', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < EMAILS_PER_ADDRESS.hour; i++) {
      expect(await mail(store, 'someone@example.org', `ip-${i}`, i * MINUTE)).toBe('accepted')
    }
    expect(await mail(store, 'someone@example.org', 'ip-new', 10 * MINUTE)).toBe('rateLimited')
    // Another hour: two more, then the day's budget of 5 is used up.
    expect(await mail(store, 'someone@example.org', 'ip-a', HOUR + MINUTE)).toBe('accepted')
    expect(await mail(store, 'someone@example.org', 'ip-b', HOUR + 2 * MINUTE)).toBe('accepted')
    expect(await mail(store, 'someone@example.org', 'ip-c', 3 * HOUR)).toBe('rateLimited')
    expect(await mail(store, 'someone@example.org', 'ip-d', DAY_WINDOW_MS - MINUTE)).toBe(
      'rateLimited',
    )
    // A day after the first ones, the budget frees up again.
    expect(await mail(store, 'someone@example.org', 'ip-e', DAY_WINDOW_MS + MINUTE)).toBe(
      'accepted',
    )
    // Other addresses were never affected.
    expect(await mail(store, 'other@example.org', 'ip-new', 10 * MINUTE)).toBe('accepted')
  })

  it('counts the variants of one mailbox as one address', async () => {
    const store = memoryLimitStore()
    for (const address of [
      'First.Last@gmail.com',
      'firstlast+news@googlemail.com',
      'f.i.r.s.t.l.a.s.t@GMAIL.com',
    ]) {
      expect(await mail(store, address, 'ip-a', 0)).toBe('accepted')
    }
    expect(await mail(store, 'firstlast@gmail.com', 'ip-b', MINUTE)).toBe('rateLimited')
  })

  it('answers "unavailable" once the site-wide cap is reached, whoever sends', async () => {
    const store = memoryLimitStore()
    for (let i = 0; i < EMAILS_SITE_WIDE.hour; i++) {
      expect(await mail(store, `person-${i}@example.org`, `ip-${i}`, i)).toBe('accepted')
    }
    expect(await mail(store, 'new@example.org', 'ip-new', 100)).toBe('unavailable')
    // Nothing of a refused send is recorded.
    expect(store.rows.filter((row) => row.key === 'mail:all')).toHaveLength(EMAILS_SITE_WIDE.hour)
  })

  it('follows the cap the server sets (EMAIL_CAP_HOUR, EMAIL_CAP_DAY), read for each send', async () => {
    vi.stubEnv('EMAIL_CAP_HOUR', '2')
    vi.stubEnv('EMAIL_CAP_DAY', '3')
    try {
      const store = memoryLimitStore()
      expect(await mail(store, 'a@example.org', 'ip-a', 0)).toBe('accepted')
      expect(await mail(store, 'b@example.org', 'ip-b', MINUTE)).toBe('accepted')
      expect(await mail(store, 'c@example.org', 'ip-c', 2 * MINUTE)).toBe('unavailable')
      // The next hour: one more, then the day's 3 are used up.
      expect(await mail(store, 'c@example.org', 'ip-c', HOUR + MINUTE)).toBe('accepted')
      expect(await mail(store, 'd@example.org', 'ip-d', HOUR + 2 * MINUTE)).toBe('unavailable')
      // An unusable setting is replaced by the stricter of its default and the other one
      // (email-cap.test.ts).
      vi.stubEnv('EMAIL_CAP_HOUR', 'many')
      vi.stubEnv('EMAIL_CAP_DAY', '')
      const limits = emailLimits('hash').filter((limit) => limit.key === 'mail:all')
      expect(limits.map((limit) => limit.perWindow)).toEqual([
        EMAILS_SITE_WIDE.hour,
        EMAILS_SITE_WIDE.day,
      ])
      // A day below the default hour, alone, holds the hour to it.
      vi.stubEnv('EMAIL_CAP_HOUR', '')
      vi.stubEnv('EMAIL_CAP_DAY', '20')
      const low = emailLimits('hash').filter((limit) => limit.key === 'mail:all')
      expect(low.map((limit) => limit.perWindow)).toEqual([20, 20])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('checks the limits in their order: the first one reached decides', async () => {
    const store = memoryLimitStore()
    const cap: Limit = { key: 'cap', perWindow: 1, windowMs: HOUR, problem: 'unavailable' }
    const own: Limit = { key: 'own', perWindow: 1, windowMs: HOUR }
    expect(await admit(store, { keys: [own, cap], now: at(0) })).toBe('accepted')
    expect(await admit(store, { keys: [own, cap], now: at(1) })).toBe('rateLimited')
    expect(await admit(store, { keys: [cap, own], now: at(2) })).toBe('unavailable')
  })

  it('records one row per key, also when two limits share it', async () => {
    const store = memoryLimitStore()
    await mail(store, 'someone@example.org', 'ip-a', 0, 'the-answer')
    const keys = store.rows.map((row) => row.key)
    expect(keys).toHaveLength(4)
    expect(keys).toEqual([
      'ip:signin:ip-a',
      `mail:addr:${hashLimitAddress('someone@example.org', SECRET)}`,
      'mail:all',
      'altcha:the-answer',
    ])
    // The address itself is never stored.
    expect(JSON.stringify(store.rows)).not.toContain('someone')
  })

  it('works without a spam-check answer (the "Create account" step)', async () => {
    const store = memoryLimitStore()
    const create: Limit = { key: 'ip:create:ip-a', perWindow: 2, windowMs: HOUR }
    expect(await admit(store, { keys: [create], now: at(0) })).toBe('accepted')
    expect(await admit(store, { keys: [create], now: at(1) })).toBe('accepted')
    expect(await admit(store, { keys: [create], now: at(2) })).toBe('rateLimited')
    expect(store.rows.map((row) => row.key)).toEqual(['ip:create:ip-a', 'ip:create:ip-a'])
  })

  it('refuses a window longer than the rows are kept, or no window at all', async () => {
    const store = memoryLimitStore()
    for (const limit of [
      { key: 'k', perWindow: 1, windowMs: DAY_WINDOW_MS + 1 },
      { key: 'k', perWindow: 1, windowMs: 0 },
      { key: 'k', perWindow: 0, windowMs: HOUR },
    ]) {
      await expect(admit(store, { keys: [limit], now: at(0) })).rejects.toThrow('Unusable')
    }
    expect(LIMIT_RETENTION_MS).toBe(DAY_WINDOW_MS)
  })
})

describe('hashLimitAddress', () => {
  it('is a keyed hash of the canonical address that depends on the secret', () => {
    const hash = hashLimitAddress('Someone+tag@Example.org', 'secret-a')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashLimitAddress('someone@example.org', 'secret-a')).toBe(hash)
    expect(hashLimitAddress('someone@example.org', 'secret-b')).not.toBe(hash)
    expect(hashLimitAddress('someone.else@example.org', 'secret-a')).not.toBe(hash)
  })
})
