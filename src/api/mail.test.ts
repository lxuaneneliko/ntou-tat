import { describe, expect, it } from 'vitest'
import { normalizeMailAccount } from './mail'

describe('Mail2000 account normalization', () => {
  it('accepts a student id or the full NTOU mail address', () => {
    expect(normalizeMailAccount(' 00000000 ')).toBe('00000000')
    expect(normalizeMailAccount('00000000@MAIL.NTOU.EDU.TW')).toBe('00000000')
  })

  it('does not modify a non-NTOU suffix', () => {
    expect(normalizeMailAccount('student@example.com')).toBe('student@example.com')
  })
})
