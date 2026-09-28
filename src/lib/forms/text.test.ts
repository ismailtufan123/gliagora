import { describe, expect, it } from 'vitest'

import { EMAIL_MAX } from './fields'
import { cleanText, emailProblem } from './text'

describe('cleanText', () => {
  it('removes control characters and text-reordering characters', () => {
    expect(cleanText('a\u0000b\u0007c\u001bd\u007fe\u0085f')).toBe('abcdef')
    expect(cleanText('evil‮gnp.exe ⁦x⁩')).toBe('evilgnp.exe x')
  })

  it('keeps line breaks and tabs, as "\\n", and trims', () => {
    expect(cleanText('  line 1\r\nline 2\rline 3\n\tindented \n')).toBe(
      'line 1\nline 2\nline 3\n\tindented',
    )
  })
})

describe('emailProblem', () => {
  it('accepts an empty address and ordinary ones', () => {
    for (const email of ['', 'someone@example.org', 'first.last+tag@sub.example.co.uk']) {
      expect(emailProblem(email), email).toBeNull()
    }
  })

  it('refuses addresses that cannot be delivered, and over-long ones', () => {
    for (const email of ['someone', 'someone@example', 'a b@example.org', 'a..b@example.org']) {
      expect(emailProblem(email), email).toBe('emailInvalid')
    }
    expect(emailProblem(`${'a'.repeat(EMAIL_MAX - 11)}@example.org`)).toBe('emailTooLong')
    expect(emailProblem(`${'a'.repeat(EMAIL_MAX - 12)}@example.org`)).toBeNull()
  })
})
