import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  TOKEN_HASH_PATTERN,
  TOKEN_PATTERN,
  bindingMatches,
  hashToken,
  isToken,
  newBinding,
  newToken,
  sameSecret,
} from './tokens'

describe('tokens', () => {
  it('are 32 random bytes in base64url, different every time', () => {
    const tokens = Array.from({ length: 50 }, newToken)
    for (const token of tokens) {
      expect(token).toMatch(TOKEN_PATTERN)
      expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    }
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('are stored as SHA-256 in hex only', () => {
    const token = newToken()
    expect(hashToken(token)).toMatch(TOKEN_HASH_PATTERN)
    expect(hashToken(token)).toBe(createHash('sha256').update(token).digest('hex'))
    expect(hashToken(token)).not.toContain(token)
  })

  it('are recognised by their shape before any lookup', () => {
    expect(isToken(newToken())).toBe(true)
    for (const value of ['', 'short', `${newToken()}x`, `${newToken().slice(1)}=`, null, 7]) {
      expect(isToken(value)).toBe(false)
    }
  })
})

describe('sameSecret', () => {
  it('compares in constant time, whatever the lengths', () => {
    expect(sameSecret('state-value', 'state-value')).toBe(true)
    expect(sameSecret('state-value', 'state-valuf')).toBe(false)
    expect(sameSecret('state-value', 'state')).toBe(false)
    expect(sameSecret('', '')).toBe(true)
  })
})

describe('email link bindings', () => {
  it('match only the binding whose hash the token holds', () => {
    const binding = newBinding()
    expect(binding).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(bindingMatches(binding, hashToken(binding))).toBe(true)
    expect(bindingMatches(newBinding(), hashToken(binding))).toBe(false)
    expect(bindingMatches(binding, null)).toBe(false)
    expect(bindingMatches(binding, 'not-a-hash')).toBe(false)
  })
})
