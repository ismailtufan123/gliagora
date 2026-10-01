import { describe, expect, it } from 'vitest'

import { DEFAULT_NEXT, parseSave, safeNext, saveValue } from './return-path'

const ORIGIN = 'https://gliagora.com'

describe('safeNext', () => {
  it.each([
    ['/en/jobs/', '/en/jobs/'],
    ['/en/jobs/?type=phd&page=2', '/en/jobs/?type=phd&page=2'],
    ['/tr/', '/tr/'],
    ['/en/account/saved/', '/en/account/saved/'],
    ['/en/jobs/#job-k3f9a', '/en/jobs/'],
    ['https://gliagora.com/en/jobs/', '/en/jobs/'],
    ['/en/sign-in/../jobs/', '/en/jobs/'],
    ['/en/jobs/?q=a%2F%2Fb', '/en/jobs/?q=a%2F%2Fb'],
    // A relative path is read from the site's root.
    ['en/jobs/', '/en/jobs/'],
  ])('keeps %j as %j', (next, kept) => {
    expect(safeNext(next, ORIGIN)).toBe(kept)
  })

  it.each([
    [null],
    [''],
    ['https://evil.example.org/en/'],
    ['//evil.example.org/en/'],
    ['/\\evil.example.org/en/'],
    ['\\\\evil.example.org'],
    ['/en//evil'],
    ['http://gliagora.com/en/'],
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['/admin'],
    ['/admin/collections/users'],
    ['/api/users/me'],
    ['/en/sign-in/'],
    ['/en/sign-in/link/?token=x'],
    ['/en/sign-out/'],
    ['/health/'],
    ['/'],
    ['/en/jobs/\n'],
    ['/en/\tjobs/'],
    ['/en/jobs/\u0000'],
    ['/en/%2e%2e/admin'],
  ])('refuses %j', (next) => {
    expect(safeNext(next, ORIGIN)).toBe(DEFAULT_NEXT)
  })

  it('keeps only the path of a very long address, and nothing of an endless path', () => {
    const query = `?q=${'a'.repeat(1000)}`
    expect(safeNext(`/en/jobs/${query}`, ORIGIN)).toBe('/en/jobs/')
    expect(safeNext(`/en/${'a'.repeat(1001)}`, ORIGIN)).toBe(DEFAULT_NEXT)
  })

  it('stays on the origin it is given (local runs)', () => {
    expect(safeNext('http://localhost:3000/en/jobs/', 'http://localhost:3000')).toBe('/en/jobs/')
    expect(safeNext('http://127.0.0.1:3000/en/jobs/', 'http://localhost:3000')).toBe(DEFAULT_NEXT)
  })
})

describe('parseSave', () => {
  it('reads a job by its short ID', () => {
    expect(parseSave('job:k3f9a')).toEqual({ type: 'job', shortId: 'k3f9a' })
    expect(saveValue({ type: 'job', shortId: 'k3f9a' })).toBe('job:k3f9a')
  })

  it.each([
    '',
    'job:',
    'job:K3F9A',
    'job:k3f9',
    'job:k3f9ab',
    'job:k3f9i',
    'event:k3f9a',
    ' job:k3f9a',
    null,
  ])('refuses %j', (value) => {
    expect(parseSave(value)).toBeNull()
  })
})
