import { describe, expect, it } from 'vitest'

import { canonicalUrl, isHttpUrl } from './url'

describe('isHttpUrl', () => {
  it('accepts full http and https addresses', () => {
    expect(isHttpUrl('https://www.example.org/jobs/123')).toBe(true)
    expect(isHttpUrl('http://example.org')).toBe(true)
  })

  it('refuses other schemes, relative addresses and stray spaces', () => {
    for (const value of [
      'ftp://example.org/job',
      'javascript:alert(1)',
      'mailto:jobs@example.org',
      'www.example.org/job',
      '/jobs/123',
      ' https://example.org/',
      '',
      null,
      42,
    ]) {
      expect(isHttpUrl(value)).toBe(false)
    }
  })
})

describe('canonicalUrl', () => {
  it('lower-cases the host but keeps the case of the path', () => {
    expect(canonicalUrl('HTTPS://Jobs.Example.ORG/Careers/PhD-123')).toBe(
      'https://jobs.example.org/Careers/PhD-123',
    )
  })

  it('drops default ports, fragments and sign-in details', () => {
    expect(canonicalUrl('https://example.org:443/job#apply')).toBe('https://example.org/job')
    expect(canonicalUrl('http://example.org:80/job')).toBe('https://example.org/job')
    expect(canonicalUrl('https://example.org:8443/job')).toBe('https://example.org:8443/job')
    expect(canonicalUrl('https://user:secret@example.org/job')).toBe('https://example.org/job')
  })

  it('drops tracking parameters and sorts the others', () => {
    expect(
      canonicalUrl(
        'https://example.org/job?utm_source=x&UTM_Medium=y&id=7&fbclid=a&gclid=b&dclid=c&msclkid=d&mc_cid=e&mc_eid=f&_hsenc=g&_hsmi=h&igshid=i&ref_src=j&lang=en',
      ),
    ).toBe('https://example.org/job?id=7&lang=en')
    expect(canonicalUrl('https://example.org/job?b=2&a=1')).toBe(
      canonicalUrl('https://example.org/job?a=1&b=2'),
    )
    expect(canonicalUrl('https://example.org/job?utm_source=newsletter')).toBe(
      'https://example.org/job',
    )
    expect(
      canonicalUrl(
        'https://jobs.example.org/job/123?_gl=1*abc*_ga*MTIz&_ga=2.1&gad_source=1&srsltid=AfmB&gbraid=k&wbraid=l&yclid=m&mkt_tok=n&hsa_acc=1&HSA_cam=2&id=7',
      ),
    ).toBe('https://jobs.example.org/job/123?id=7')
    // Parameters that only look similar stay.
    expect(canonicalUrl('https://example.org/job?source=board')).toBe(
      'https://example.org/job?source=board',
    )
  })

  it('treats /a and /a/ as the same address', () => {
    expect(canonicalUrl('https://example.org/jobs/123/')).toBe('https://example.org/jobs/123')
    expect(canonicalUrl('https://example.org/jobs/123//')).toBe('https://example.org/jobs/123')
    expect(canonicalUrl('https://example.org')).toBe('https://example.org/')
    expect(canonicalUrl('https://example.org/')).toBe('https://example.org/')
  })

  it('finds the same posting written in different ways', () => {
    const forms = [
      'https://Example.org/jobs/123/?utm_campaign=autumn#details',
      'https://example.org:443/jobs/123',
      ' https://example.org/jobs/123?fbclid=IwAR0 ',
      'http://example.org/jobs/123/',
      'HTTP://EXAMPLE.ORG:80/jobs/123?_gl=1*abc',
    ]
    expect(new Set(forms.map(canonicalUrl))).toEqual(new Set(['https://example.org/jobs/123']))
  })

  it('treats http and https as the same address', () => {
    expect(canonicalUrl('http://example.org/job')).toBe(canonicalUrl('https://example.org/job'))
    expect(canonicalUrl('http://example.org:8080/job')).toBe('https://example.org:8080/job')
  })

  it('writes percent-escapes in the path in upper case', () => {
    const forms = [
      'https://example.org/stelle/m%c3%bcnchen-postdoc',
      'https://example.org/stelle/m%C3%BCnchen-postdoc',
      'https://example.org/stelle/münchen-postdoc',
    ]
    expect(new Set(forms.map(canonicalUrl))).toEqual(
      new Set(['https://example.org/stelle/m%C3%BCnchen-postdoc']),
    )
    expect(canonicalUrl('https://example.org/job?q=m%c3%bc')).toBe(
      'https://example.org/job?q=m%C3%BC',
    )
  })

  it('writes international host names in one form', () => {
    for (const url of [
      'https://BÜCHER.example/job',
      'https://bücher.example/job',
      'https://xn--bcher-kva.example/job',
    ]) {
      expect(canonicalUrl(url)).toBe('https://xn--bcher-kva.example/job')
    }
  })

  it('gives null for anything that is not an http(s) address', () => {
    expect(canonicalUrl('mailto:jobs@example.org')).toBeNull()
    expect(canonicalUrl('example.org/job')).toBeNull()
    expect(canonicalUrl('')).toBeNull()
  })
})
