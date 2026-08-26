import { describe, expect, it } from 'vitest'
import { decodeMailHeader } from './mailMime'

describe('Mail2000 MIME headers', () => {
  it('decodes adjacent UTF-8 words in a mixed Chinese subject', () => {
    const raw = '[教務處] 【線上課程】 =?utf-8?B?6IG35aC05b+F5YKZIEFJIMOXiEV4Y2VsIOWgsQ==?==?utf-8?B?6KGo5a+m5oiw54+t?='

    expect(decodeMailHeader(raw)).toBe('[教務處] 【線上課程】 職場必備 AI × Excel 報表實戰班')
  })

  it('decodes quoted-printable header words', () => {
    expect(decodeMailHeader('=?UTF-8?Q?Mail2000_=E9=80=9A=E7=9F=A5?=')).toBe('Mail2000 通知')
  })
})
