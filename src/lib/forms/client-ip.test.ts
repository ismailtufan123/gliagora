import { describe, expect, it } from 'vitest'

import { UNKNOWN_CLIENT, clientIp, hashClientIp, limitSubject } from './client-ip'

const headers = (values: Record<string, string>) => new Headers(values)
const SECRET = 'test-only-payload-secret'

describe('client IP address', () => {
  it('is the first entry of X-Forwarded-For, which Caddy sets', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7')
    expect(clientIp(headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.2' }))).toBe('203.0.113.7')
    expect(clientIp(headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
  })

  it('falls back to X-Real-IP, then to one shared value', () => {
    expect(
      clientIp(headers({ 'x-forwarded-for': 'not-an-address', 'x-real-ip': '198.51.100.4' })),
    ).toBe('198.51.100.4')
    expect(clientIp(headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4')
    expect(clientIp(headers({}))).toBe(UNKNOWN_CLIENT)
    expect(clientIp(headers({ 'x-forwarded-for': 'unknown', 'x-real-ip': '' }))).toBe(
      UNKNOWN_CLIENT,
    )
  })
})

describe('what the rate limit counts', () => {
  it('counts an IPv4 address as it is, also when written as IPv6', () => {
    expect(limitSubject('192.0.2.1')).toBe('192.0.2.1')
    expect(limitSubject('::ffff:192.0.2.1')).toBe('192.0.2.1')
    expect(limitSubject('::ffff:c000:201')).toBe('192.0.2.1')
  })

  it('counts an IPv6 address by its /64 network, whatever its notation', () => {
    const subject = '2001:db8:aa:bb::/64'
    for (const ip of [
      '2001:db8:aa:bb::1',
      '2001:0db8:00aa:00bb:1111:2222:3333:4444',
      '2001:DB8:AA:BB:0:0:0:99',
      '2001:db8:aa:bb::5%eth0',
    ]) {
      expect(limitSubject(ip), ip).toBe(subject)
    }
    expect(limitSubject('2001:db8:aa:bc::1')).not.toBe(subject)
    expect(limitSubject('::1')).toBe('0:0:0:0::/64')
    expect(limitSubject('2001:db8::')).toBe('2001:db8:0:0::/64')
  })

  it('treats anything else as the shared unknown client', () => {
    expect(limitSubject(UNKNOWN_CLIENT)).toBe(UNKNOWN_CLIENT)
    expect(limitSubject('999.1.1.1')).toBe(UNKNOWN_CLIENT)
  })
})

describe('hashed IP address', () => {
  it('is an HMAC that does not contain the address and depends on the secret', () => {
    const hash = hashClientIp('203.0.113.7', SECRET)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('203')
    expect(hashClientIp('203.0.113.7', SECRET)).toBe(hash)
    expect(hashClientIp('203.0.113.8', SECRET)).not.toBe(hash)
    expect(hashClientIp('203.0.113.7', `${SECRET}-rotated`)).not.toBe(hash)
  })

  it('is the same for addresses in one IPv6 /64 network', () => {
    expect(hashClientIp('2001:db8:aa:bb::1', SECRET)).toBe(
      hashClientIp('2001:db8:aa:bb:ffff::2', SECRET),
    )
  })

  it('needs PAYLOAD_SECRET', () => {
    expect(() => hashClientIp('203.0.113.7', '')).toThrow('PAYLOAD_SECRET')
  })
})
