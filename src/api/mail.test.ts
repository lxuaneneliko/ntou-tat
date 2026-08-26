import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeMailAccount } from './mail'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Mail2000 account normalization', () => {
  it('accepts a student id or the full NTOU mail address', () => {
    expect(normalizeMailAccount(' 00000000 ')).toBe('00000000')
    expect(normalizeMailAccount('00000000@MAIL.NTOU.EDU.TW')).toBe('00000000')
  })

  it('does not modify a non-NTOU suffix', () => {
    expect(normalizeMailAccount('student@example.com')).toBe('student@example.com')
  })
})

describe('Mail2000 message presentation', () => {
  it('keeps inline images between their surrounding text blocks', async () => {
    vi.stubEnv('VITE_NTOU_AUTH_MODE', 'mock')
    const { mailApi } = await import('./mail')

    const message = await mailApi.getMessage({ account: '00000000', password: 'test' }, 'INBOX', '501')

    expect(message.bodyBlocks).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('同學您好') }),
      { type: 'image', imageId: 'mock-poster' },
      expect.objectContaining({ type: 'text', text: expect.stringContaining('https://www.ntou.edu.tw/') }),
    ])
    expect(message.bodyImages[0]).toEqual(expect.objectContaining({
      id: 'mock-poster',
      width: 640,
      height: 360,
      referenced: true,
    }))
  })
})
