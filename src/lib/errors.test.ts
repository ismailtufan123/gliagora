import { describe, expect, it } from 'vitest'

import { errorCode, errorFrames, errorSummary } from './errors'

describe('error descriptions without personal data', () => {
  it('give the class and codes, never the message', () => {
    const smtp = Object.assign(new Error('Recipient <someone@example.org> rejected'), {
      code: 'EENVELOPE',
      responseCode: 550,
    })
    expect(errorSummary(smtp)).toBe('Error EENVELOPE 550')
    const wrapped = new Error('Failed query: update … params: someone@example.org', {
      cause: Object.assign(new Error('invalid byte sequence'), { code: '22021' }),
    })
    expect(errorCode(wrapped)).toBe('22021')
    expect(errorSummary(wrapped)).toBe('Error 22021')
    expect(errorSummary(new TypeError('x'))).toBe('TypeError')
    expect(errorSummary('text')).toBe('string')
  })

  it('give where an error was thrown, without its first line', () => {
    const error = new Error('Recipient someone@example.org rejected')
    const frames = errorFrames(error)
    expect(frames).not.toContain('someone@example.org')
    expect(frames.split('\n').every((line) => /^\s+at /.test(line))).toBe(true)
    expect(errorFrames('not an error')).toBe('')
  })
})
