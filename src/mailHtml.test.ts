// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { safeMailHtml } from './mailHtml'

describe('safeMailHtml', () => {
  it('removes executable content and unsafe links', () => {
    const result = safeMailHtml(
      '<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">bad</a><a href="https://ntou.edu.tw">good</a>',
      {},
      false,
    )

    expect(result.srcDoc).not.toContain('<script')
    expect(result.srcDoc).not.toContain('javascript:')
    expect(result.srcDoc).not.toContain('onclick')
    expect(result.srcDoc).toContain('href="https://ntou.edu.tw"')
  })

  it('blocks remote images until the user allows them', () => {
    const blocked = safeMailHtml('<img src="https://tracker.example/pixel.png">', {}, false)
    const allowed = safeMailHtml('<img src="https://tracker.example/pixel.png">', {}, true)

    expect(blocked.hasRemoteImages).toBe(true)
    expect(blocked.srcDoc).not.toContain('tracker.example')
    expect(allowed.srcDoc).toContain('https://tracker.example/pixel.png')
  })

  it('renders same-message cid images without a network request', () => {
    const result = safeMailHtml('<img src="cid:logo-1">', { 'logo-1': 'data:image/png;base64,AAAA' }, false)

    expect(result.srcDoc).toContain('data:image/png;base64,AAAA')
    expect(result.hasRemoteImages).toBe(false)
  })
})
