import { createChallenge } from 'altcha-lib/v1'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { solveChallenge } from '@/components/forms/solve'

import {
  ALTCHA_MAX_NUMBER,
  ALTCHA_TTL_MS,
  type SpamChallenge,
  altchaKey,
  checkAnswer,
  newChallenge,
  readAnswer,
} from './altcha'
import { LIMIT_RETENTION_MS } from './rate-limit'

const KEY = 'test-only-hmac-key-0123456789abcdef0123456789abcdef'
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64')
const decode = (value: string) => JSON.parse(Buffer.from(value, 'base64').toString('utf8'))

/** A challenge whose secret number is known, so tests solve it at once. */
async function easyChallenge(number: number, expires: Date, key = KEY): Promise<SpamChallenge> {
  const { algorithm, challenge, salt, signature } = await createChallenge({
    hmacKey: key,
    algorithm: 'SHA-256',
    number,
    maxnumber: ALTCHA_MAX_NUMBER,
    expires,
  })
  return { algorithm, challenge, maxnumber: ALTCHA_MAX_NUMBER, salt, signature }
}

const whileValid = () => new Date(Date.now() + ALTCHA_TTL_MS)

describe('ALTCHA key', () => {
  it('is used only when set to a real value of at least 32 characters', () => {
    expect(altchaKey({})).toBeNull()
    expect(altchaKey({ ALTCHA_HMAC_KEY: '' })).toBeNull()
    expect(altchaKey({ ALTCHA_HMAC_KEY: 'too-short' })).toBeNull()
    expect(altchaKey({ ALTCHA_HMAC_KEY: 'replace-with-openssl-rand-hex-32' })).toBeNull()
    expect(altchaKey({ ALTCHA_HMAC_KEY: ` ${KEY} ` })).toBe(KEY)
  })
})

describe('ALTCHA challenges', () => {
  it('stay valid longer than 20 hours, but not as long as used answers are remembered', () => {
    // WCAG 2.2.1: a time limit over 20 hours needs no warning or extension.
    expect(ALTCHA_TTL_MS).toBeGreaterThan(20 * 60 * 60_000)
    // A used answer is remembered 24 hours; the hourly clean-up (M4.7) may take an hour off that.
    expect(ALTCHA_TTL_MS).toBeLessThanOrEqual(LIMIT_RETENTION_MS - 2 * 60 * 60_000)
  })

  it('gives the browser a signed challenge with its expiry, never the secret number', async () => {
    const now = new Date('2026-09-28T10:00:00Z')
    const spam = await newChallenge(KEY, now)
    expect(Object.keys(spam).sort()).toEqual([
      'algorithm',
      'challenge',
      'maxnumber',
      'salt',
      'signature',
    ])
    expect(spam).toMatchObject({ algorithm: 'SHA-256', maxnumber: ALTCHA_MAX_NUMBER })
    expect(spam.salt).toContain(`expires=${(now.getTime() + ALTCHA_TTL_MS) / 1000}`)
    // Each page gets its own.
    expect((await newChallenge(KEY, now)).challenge).not.toBe(spam.challenge)
  })

  // The real solver on a real challenge: up to ALTCHA_MAX_NUMBER hashes, slower in Node than in
  // a browser, so with more time when the whole suite runs at once.
  it(
    'accepts the answer the browser finds, with a replay key for the rate-limit table',
    {
      timeout: 30_000,
    },
    async () => {
      const spam = await newChallenge(KEY)
      const answer = await solveChallenge(spam)
      expect(answer).not.toBeNull()
      const check = await checkAnswer(answer!, KEY, new Date())
      expect(check).toEqual({ ok: true, replayKey: expect.stringMatching(/^[0-9a-f]{64}$/) })
      // The same answer gives the same key, which the rate-limit table then refuses.
      expect(await checkAnswer(answer!, KEY, new Date())).toEqual(check)
      // The key is a hash of the signature, not the signature itself.
      expect(check.ok && check.replayKey).not.toBe(spam.signature)
    },
  )

  it('says when there is no answer: the browser ran no JavaScript', async () => {
    expect(await checkAnswer('', KEY, new Date())).toEqual({ ok: false, reason: 'missing' })
  })

  it('refuses wrong, changed or made-up answers', async () => {
    const spam = await easyChallenge(42, whileValid())
    const good = decode((await solveChallenge(spam))!)
    expect(good.number).toBe(42)
    const now = new Date()
    for (const bad of [
      encode({ ...good, number: 43 }),
      encode({
        ...good,
        signature: good.signature.replace(/^./, (c: string) => (c === 'a' ? 'b' : 'a')),
      }),
      encode({ ...good, algorithm: 'SHA-1' }),
      encode({ ...good, number: ALTCHA_MAX_NUMBER + 1 }),
      encode({ ...good, number: '42' }),
      encode({ ...good, salt: good.salt.replace(/expires=\d+/, 'expires=9999999999') }),
      'not base64 at all',
      encode('a string'),
      'A'.repeat(2_000),
    ]) {
      expect(await checkAnswer(bad, KEY, now), bad.slice(0, 40)).toEqual({
        ok: false,
        reason: 'invalid',
      })
    }
    // Signed with another key.
    const other = await easyChallenge(7, whileValid(), `${KEY}-other`)
    expect(await checkAnswer((await solveChallenge(other))!, KEY, now)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('refuses answers to expired challenges', async () => {
    const created = new Date()
    const spam = await easyChallenge(99, new Date(created.getTime() + ALTCHA_TTL_MS))
    const answer = (await solveChallenge(spam))!
    const justBefore = new Date(created.getTime() + ALTCHA_TTL_MS - 1_000)
    const after = new Date(created.getTime() + ALTCHA_TTL_MS + 1_000)
    expect((await checkAnswer(answer, KEY, justBefore)).ok).toBe(true)
    expect(await checkAnswer(answer, KEY, after)).toEqual({ ok: false, reason: 'expired' })
  })

  it('reads only answers in the expected shape', () => {
    expect(readAnswer('')).toBeNull()
    expect(readAnswer(encode({ algorithm: 'SHA-256' }))).toBeNull()
    const answer = {
      algorithm: 'SHA-256',
      challenge: 'a'.repeat(64),
      number: 5,
      salt: 'abc?expires=1&',
      signature: 'b'.repeat(64),
    }
    expect(readAnswer(encode(answer))).toEqual(answer)
  })
})

describe('the solver in the browser', () => {
  it('finds the secret number and answers in ALTCHA’s format', async () => {
    const spam = await easyChallenge(1234, whileValid())
    expect(decode((await solveChallenge(spam))!)).toEqual({
      algorithm: spam.algorithm,
      challenge: spam.challenge,
      number: 1234,
      salt: spam.salt,
      signature: spam.signature,
    })
  })

  it('gives up after maxnumber, without an answer', async () => {
    const spam = await easyChallenge(900, whileValid())
    expect(await solveChallenge({ ...spam, maxnumber: 800 })).toBeNull()
  })

  describe('between batches of 500 hashes', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    // Without a turn for the browser, the whole search is one task that freezes the page.
    it('gives the browser a turn with scheduler.yield()', async () => {
      const yieldTo = vi.fn(async () => {})
      vi.stubGlobal('scheduler', { yield: yieldTo })
      // 1234 is in the third batch: two turns before it.
      const spam = await easyChallenge(1234, whileValid())
      expect(await solveChallenge(spam)).not.toBeNull()
      expect(yieldTo).toHaveBeenCalledTimes(2)
    })

    it('or with a timer where scheduler.yield() does not exist', async () => {
      vi.stubGlobal('scheduler', undefined)
      const timer = vi.spyOn(globalThis, 'setTimeout')
      const spam = await easyChallenge(1234, whileValid())
      expect(await solveChallenge(spam)).not.toBeNull()
      expect(timer.mock.calls.filter(([, delay]) => delay === 0)).toHaveLength(2)
    })
  })
})
