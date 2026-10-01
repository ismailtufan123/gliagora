import { createHmac, hkdfSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { derivedKey, keyedHash } from './keys'

const SECRET = 'test-only-payload-secret'

describe('derivedKey', () => {
  it('is HKDF-SHA256 of PAYLOAD_SECRET with the purpose as its label', () => {
    const expected = Buffer.from(hkdfSync('sha256', SECRET, '', 'gliagora/forms/ip-hash/v1', 32))
    expect(derivedKey(SECRET, 'gliagora/forms/ip-hash/v1').equals(expected)).toBe(true)
  })

  it('gives each purpose and each secret its own key', () => {
    const keys = [
      derivedKey(SECRET, 'gliagora/forms/ip-hash/v1'),
      derivedKey(SECRET, 'gliagora/forms/address-hash/v1'),
      derivedKey(SECRET, 'gliagora/data-requests/address/v1'),
      derivedKey(SECRET, 'gliagora/members/signin-cookie/v1'),
      derivedKey(`${SECRET}-rotated`, 'gliagora/forms/ip-hash/v1'),
    ].map((key) => key.toString('hex'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('needs PAYLOAD_SECRET', () => {
    expect(() => derivedKey('', 'gliagora/forms/ip-hash/v1')).toThrow('PAYLOAD_SECRET')
  })
})

describe('keyedHash', () => {
  it('is HMAC-SHA256 in hex with the derived key', () => {
    const key = derivedKey(SECRET, 'label')
    expect(keyedHash(SECRET, 'label', 'value')).toBe(
      createHmac('sha256', key).update('value').digest('hex'),
    )
  })
})
