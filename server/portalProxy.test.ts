import { describe, expect, it, vi } from 'vitest'
import { CookieJar } from 'tough-cookie'
import {
  assertAllowedPortalUrl,
  openPortalSession,
  processPortalProxy,
  sealPortalSession,
} from './portalProxy'

const secret = 'test-secret-that-is-at-least-thirty-two-characters'

describe('portal proxy', () => {
  it('encrypts and restores the AIS cookie jar', async () => {
    const jar = new CookieJar()
    await jar.setCookie('ASP.NET_SessionId=abc123; Path=/; Secure; HttpOnly', 'https://ais.ntou.edu.tw/')

    const restored = openPortalSession(sealPortalSession(jar, secret, 1_000), secret, 2_000)

    await expect(restored.getCookieString('https://ais.ntou.edu.tw/')).resolves.toContain(
      'ASP.NET_SessionId=abc123',
    )
  })

  it('rejects non-NTOU targets and public-site POSTs', () => {
    expect(() => assertAllowedPortalUrl('https://example.com/', 'GET')).toThrow('not allowed')
    expect(() => assertAllowedPortalUrl('http://ais.ntou.edu.tw/', 'GET')).toThrow('HTTPS')
    expect(() => assertAllowedPortalUrl('https://www.ntou.edu.tw/calendar', 'POST')).toThrow('Only GET')
  })

  it('keeps upstream cookies between challenge and image requests', async () => {
    const challengeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('cookie')).toBeNull()
      return new Response('<html><img id="importantImg" src="/Temp/Captcha/session1.png" alt="captcha" /></html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Set-Cookie': 'ASP.NET_SessionId=session1; Path=/; Secure; HttpOnly',
        },
      })
    }) as typeof fetch
    const challenge = await processPortalProxy(
      { action: 'request', url: 'https://ais.ntou.edu.tw/Default.aspx' },
      undefined,
      secret,
      challengeFetch,
    )

    expect(challenge.httpStatus).toBe(200)
    expect(challenge.body.cookieNames).toContain('ASP.NET_SessionId')
    expect(challenge.body.data).toContain('src="/__ntou_tat_captcha__"')
    expect(challenge.body.data).not.toContain('/Temp/Captcha/session1.png')

    const imageFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('cookie')).toContain('ASP.NET_SessionId=session1')
      expect(url.toString()).toContain('/Temp/Captcha/session1.png')
      return new Response(Uint8Array.from([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    }) as typeof fetch
    const image = await processPortalProxy(
      { action: 'image', url: 'https://ais.ntou.edu.tw/__ntou_tat_captcha__' },
      challenge.sessionToken,
      secret,
      imageFetch,
    )

    expect(image.body.dataUrl).toBe('data:image/png;base64,iVBORw==')
  })

  it('does not expose upstream Set-Cookie headers to the browser', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', {
      headers: { 'Set-Cookie': 'secret=value; Path=/', 'Content-Type': 'text/plain' },
    })) as typeof fetch
    const result = await processPortalProxy(
      { action: 'request', url: 'https://ais.ntou.edu.tw/' },
      undefined,
      secret,
      fetchMock,
    )

    expect(result.body.headers).not.toHaveProperty('set-cookie')
  })

  it('does not overwrite the AIS session for concurrent public calendar requests', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>calendar</html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })) as typeof fetch
    const result = await processPortalProxy(
      { action: 'request', url: 'https://www.ntou.edu.tw/calendar', method: 'GET' },
      undefined,
      secret,
      fetchMock,
    )

    expect(result.httpStatus).toBe(200)
    expect(result.sessionToken).toBeUndefined()
  })
})
