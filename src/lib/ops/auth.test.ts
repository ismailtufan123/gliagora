import { hkdfSync } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { OPS_LABEL, opsAllowed, opsToken } from './auth'

const SECRET = 'test-secret-for-the-ops-routes'

// As call.mjs sends it inside the container: Next.js's server sets X-Forwarded-For to the
// connection's address when a request has none.
const request = (headers: Record<string, string>) =>
  new Request('http://127.0.0.1:3000/api/ops/monitors/run/', {
    method: 'POST',
    headers: { host: '127.0.0.1:3000', 'x-forwarded-for': '127.0.0.1', ...headers },
  })

describe('opsAllowed', () => {
  const key = opsToken(SECRET)

  it('takes a request from inside the container with the key', () => {
    expect(opsAllowed(request({ authorization: `Bearer ${key}` }), SECRET)).toBe(true)
  })

  it('refuses a request without the key, with another key, or without a secret', () => {
    expect(opsAllowed(request({}), SECRET)).toBe(false)
    expect(opsAllowed(request({ authorization: `Bearer ${'0'.repeat(64)}` }), SECRET)).toBe(false)
    expect(opsAllowed(request({ authorization: `Bearer ${key}` }), '')).toBe(false)
    expect(opsAllowed(request({ authorization: key }), SECRET)).toBe(false)
  })

  it('takes the other loopback addresses Next.js may name', () => {
    for (const address of ['::1', '::ffff:127.0.0.1']) {
      const inside = request({ authorization: `Bearer ${key}`, 'x-forwarded-for': address })
      expect(opsAllowed(inside, SECRET)).toBe(true)
    }
  })

  it('refuses a request that came through a proxy (Caddy), even with the key', () => {
    for (const header of ['x-forwarded-for', 'forwarded', 'x-real-ip', 'via']) {
      expect(
        opsAllowed(request({ authorization: `Bearer ${key}`, [header]: '203.0.113.9' }), SECRET),
      ).toBe(false)
    }
    const caddy = request({ authorization: `Bearer ${key}`, host: 'gliagora.com' })
    expect(opsAllowed(caddy, SECRET)).toBe(false)
    const chain = request({
      authorization: `Bearer ${key}`,
      'x-forwarded-for': '203.0.113.9, 127.0.0.1',
    })
    expect(opsAllowed(chain, SECRET)).toBe(false)
  })

  it('derives the same key as ops/call.mjs', () => {
    const script = readFileSync(new URL('../../../ops/call.mjs', import.meta.url), 'utf8')
    expect(script).toContain(`'${OPS_LABEL}'`)
    expect(Buffer.from(hkdfSync('sha256', SECRET, '', OPS_LABEL, 32)).toString('hex')).toBe(key)
  })
})
