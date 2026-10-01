import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import { z } from 'zod'

import { derivedKey } from '@/lib/keys'
import { SIGN_IN_COOKIE_MINUTES } from '@/lib/retention/rules'

import { SIGN_IN_COOKIE } from './cookies'

// The sign-in cookie's value (M4b, D49; the M4b design §8): sealed with AES-256-GCM, so the browser
// can neither read nor change it. It carries what must survive a trip to Google or ORCID (state,
// nonce, PKCE verifier, where to go next), the identity waiting for the "Create account" step
// (which must not be readable: an ORCID name, a Google address), or an email link's binding to
// this browser. The key comes from PAYLOAD_SECRET under its own label (src/lib/keys.ts); the
// cookie's name is bound in as additional data, so a value sealed for another purpose never opens
// as this one. Format: `v1.` + base64url(IV 12 bytes ‖ ciphertext ‖ tag 16 bytes).

const VERSION = 'v1.'
const KEY_LABEL = 'gliagora/members/signin-cookie/v1'
const IV_BYTES = 12
const TAG_BYTES = 16
/** Browsers keep cookies up to 4096 bytes, name and attributes included. */
const MAX_SEALED_LENGTH = 3800
const MINUTE_MS = 60_000

const method = z.enum(['google', 'orcid'])
const next = z.string().min(1).max(1000)
const save = z.string().max(20).optional()

/** An email link's binding: proves the link is opened in the browser that asked for it (§7.1). */
const emailBinding = z.strictObject({
  v: z.literal(1),
  kind: z.literal('email'),
  bind: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  exp: z.number().int(),
})

/** A sign-in or link flow with Google or ORCID, from the start route to the callback (§7.2). */
const oauthFlow = z.strictObject({
  v: z.literal(1),
  kind: z.literal('oauth'),
  p: method,
  state: z.string().min(16).max(128),
  nonce: z.string().min(16).max(128),
  /** The PKCE verifier, only where the provider's discovery advertises S256. */
  verifier: z.string().min(43).max(128).optional(),
  intent: z.enum(['sign-in', 'link']),
  /** The member who started a link flow; the callback requires the same session's member. */
  memberId: z.number().int().positive().optional(),
  next,
  save,
  exp: z.number().int(),
})

/** A new identity waiting for "Create account" (§7.2 step 4, the confirm page). */
const pendingAccount = z.strictObject({
  v: z.literal(1),
  kind: z.literal('confirm'),
  p: method,
  sub: z.string().min(1).max(255),
  /** A Google address, only where Google is authoritative for it (identity.ts). */
  email: z.string().max(254).optional(),
  /** The name on the ORCID record, kept only if the member ticks the box. */
  name: z.string().max(200).optional(),
  next,
  save,
  exp: z.number().int(),
})

const signInState = z.discriminatedUnion('kind', [emailBinding, oauthFlow, pendingAccount])

export type SignInState = z.infer<typeof signInState>
export type SignInKind = SignInState['kind']
/** What a caller seals: the version and the expiry are added here. */
export type SignInContent = SignInState extends infer S
  ? S extends SignInState
    ? Omit<S, 'v' | 'exp'>
    : never
  : never

/** Seals `content` for SIGN_IN_COOKIE_MINUTES from `now`. */
export function sealSignIn(content: SignInContent, secret: string, now: Date): string {
  const value = signInState.parse({
    ...content,
    v: 1,
    exp: now.getTime() + SIGN_IN_COOKIE_MINUTES * MINUTE_MS,
  })
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', derivedKey(secret, KEY_LABEL), iv)
  cipher.setAAD(Buffer.from(SIGN_IN_COOKIE, 'utf8'))
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const sealed = VERSION + Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')
  if (sealed.length > MAX_SEALED_LENGTH) throw new Error('The sign-in state is too large')
  return sealed
}

/**
 * Opens a sealed sign-in cookie of the expected `kind`, or null: another version, a changed or
 * truncated value, another key, another kind, or past its expiry. Never throws, and says nothing
 * about why: the caller only needs to know that the flow cannot go on.
 */
export function openSignIn<K extends SignInKind>(
  sealed: string | null | undefined,
  secret: string,
  now: Date,
  kind: K,
): Extract<SignInState, { kind: K }> | null {
  if (!sealed || !sealed.startsWith(VERSION) || sealed.length > MAX_SEALED_LENGTH) return null
  const raw = Buffer.from(sealed.slice(VERSION.length), 'base64url')
  if (raw.length <= IV_BYTES + TAG_BYTES) return null
  let text: string
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derivedKey(secret, KEY_LABEL),
      raw.subarray(0, IV_BYTES),
    )
    decipher.setAAD(Buffer.from(SIGN_IN_COOKIE, 'utf8'))
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
    text = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const result = signInState.safeParse(parsed)
  if (!result.success || result.data.kind !== kind) return null
  if (result.data.exp <= now.getTime()) return null
  return result.data as Extract<SignInState, { kind: K }>
}
