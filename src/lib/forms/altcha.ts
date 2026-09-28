import { createHash } from 'node:crypto'

import { createChallenge, extractParams, verifySolution } from 'altcha-lib/v1'
import { z } from 'zod'

// Spam protection with ALTCHA (PLAN §3.2, §18.2): before a form is sent, the browser finds the
// secret number behind a challenge by trying one SHA-256 hash after another (proof of work), and
// the server checks the answer. Everything runs on our own server: altcha-lib creates and checks
// challenges without any network call, and our own small solver (src/components/suggest/solve.ts)
// replaces the ALTCHA widget. Nothing is stored in the browser (no cookie), as the cookies page
// says.
//
// This uses ALTCHA's first proof-of-work scheme (`altcha-lib/v1`): a salt, a SHA-256 hash of the
// salt and a secret number, and an HMAC signature of that hash, so a challenge cannot be made up.
// Its solver is a few lines of `crypto.subtle`; the newer scheme adds key-derivation functions
// that a tiny solver cannot run as cheaply.

/** Changing the algorithm needs the solver to change too. */
export const ALTCHA_ALGORITHM = 'SHA-256'

/**
 * The secret number is between 1 and this. The browser tries numbers from 0 up, so it needs half
 * as many hashes on average. Measured in Chromium on the built app (M4.5), with the solver giving
 * the browser a turn after each batch of 500 hashes: about 0.3 s on average and 0.6 s at most on
 * a desktop, and about 1.1 s on average and 2.3 s at most with the processor slowed down four
 * times, like a mid-range phone. The page stays responsive meanwhile: no task over about 70 ms at
 * four times slower, and keys typed while it runs are handled and shown within about 60 ms. The
 * solver starts when the form is first used, so it is usually done before the person presses Send.
 */
export const ALTCHA_MAX_NUMBER = 50_000

/**
 * How long a challenge can be answered: 21 hours. The page may stay open while the person looks
 * things up or writes the note, so this is no time limit in WCAG 2.2.1's sense (over 20 hours).
 * It must stay shorter than the time a used answer is remembered (LIMIT_RETENTION_MS, 24 hours,
 * less the hourly clean-up's margin), so an answer cannot be sent again once its record is gone.
 */
export const ALTCHA_TTL_MS = 21 * 60 * 60_000

/** What the page gives the solver; the secret number is not in it. */
export type SpamChallenge = {
  algorithm: string
  challenge: string
  maxnumber: number
  salt: string
  signature: string
}

/**
 * The HMAC key for challenges, from ALTCHA_HMAC_KEY, or null if it is missing, too short or still
 * the placeholder from .env.example. Without it the form says it is temporarily unavailable, but
 * the rest of the site keeps working.
 */
export function altchaKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.ALTCHA_HMAC_KEY?.trim() ?? ''
  return key.length >= 32 && !key.startsWith('replace-with') ? key : null
}

/** A new challenge, valid for ALTCHA_TTL_MS from `now`. */
export async function newChallenge(key: string, now: Date = new Date()): Promise<SpamChallenge> {
  const {
    algorithm,
    challenge,
    maxnumber = ALTCHA_MAX_NUMBER,
    salt,
    signature,
  } = await createChallenge({
    hmacKey: key,
    algorithm: ALTCHA_ALGORITHM,
    maxnumber: ALTCHA_MAX_NUMBER,
    expires: new Date(now.getTime() + ALTCHA_TTL_MS),
  })
  return { algorithm, challenge, maxnumber, salt, signature }
}

const HEX_64 = /^[0-9a-f]{64}$/

/** An answer as the solver sends it: base64 of this JSON. Anything else is refused unread. */
const answerSchema = z.object({
  algorithm: z.literal(ALTCHA_ALGORITHM),
  challenge: z.string().regex(HEX_64),
  number: z.number().int().min(0).max(ALTCHA_MAX_NUMBER),
  salt: z.string().min(1).max(200),
  signature: z.string().regex(HEX_64),
})

type Answer = z.infer<typeof answerSchema>

/** The answer in a form field, or null if it is not one. */
export function readAnswer(value: string): Answer | null {
  if (value === '' || value.length > 1_000) return null
  try {
    const parsed = answerSchema.safeParse(JSON.parse(Buffer.from(value, 'base64').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export type AnswerCheck =
  { ok: true; replayKey: string } | { ok: false; reason: 'missing' | 'invalid' | 'expired' }

/**
 * Checks the answer to a challenge: missing (the browser ran no JavaScript), invalid (made up,
 * changed or wrong), expired, or correct. A correct answer comes with its replay key, a hash of
 * the challenge's signature: the form refuses an answer whose key it has seen before, so each
 * solved challenge sends one suggestion.
 */
export async function checkAnswer(value: string, key: string, now: Date): Promise<AnswerCheck> {
  if (value === '') return { ok: false, reason: 'missing' }
  const answer = readAnswer(value)
  // The signature covers the hash, and the hash covers the salt with its expiry time, so the
  // expiry can be read once the answer is verified.
  if (!answer || !(await verifySolution(answer, key, false))) {
    return { ok: false, reason: 'invalid' }
  }
  const expires = Number(extractParams(answer).expires) * 1000
  if (!Number.isFinite(expires) || expires <= now.getTime()) return { ok: false, reason: 'expired' }
  return {
    ok: true,
    replayKey: createHash('sha256').update(answer.signature).digest('hex'),
  }
}
