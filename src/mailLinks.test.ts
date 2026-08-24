import { describe, expect, it } from 'vitest'
import { mailTextTokens } from './mailLinks'

describe('mail link rendering', () => {
  it('turns safe web, mail and telephone links into link tokens', () => {
    const tokens = mailTextTokens(
      '網站 https://www.ntou.edu.tw\n信箱 mailto:test@mail.ntou.edu.tw\n電話 tel:0224622192',
    )

    expect(tokens.filter((token) => token.type === 'link').map((token) => token.href)).toEqual([
      'https://www.ntou.edu.tw',
      'mailto:test@mail.ntou.edu.tw',
      'tel:0224622192',
    ])
  })

  it('keeps sentence punctuation outside the link', () => {
    expect(mailTextTokens('請開啟 https://example.com。')).toEqual([
      { type: 'text', value: '請開啟 ' },
      { type: 'link', href: 'https://example.com', value: 'https://example.com' },
      { type: 'text', value: '。' },
    ])
  })

  it('does not link unsupported schemes', () => {
    expect(mailTextTokens('javascript:alert(1)')).toEqual([
      { type: 'text', value: 'javascript:alert(1)' },
    ])
  })
})
