import { describe, expect, it } from 'vitest'
import {
  hasAisAuthCookie,
  parseAisClientRedirect,
  parseAisLoginChallenge,
  parseAisLoginResult,
  parsePortalProfile,
} from './portalParser'

const loginHtml = `
<form name="form1" method="post" action="./" id="form1">
  <input type="hidden" name="__VIEWSTATE" value="view" />
  <input type="hidden" name="__VIEWSTATEGENERATOR" value="gen" />
  <input type="hidden" name="__VIEWSTATEENCRYPTED" value="" />
  <input type="hidden" name="__EVENTVALIDATION" value="event" />
  <input name="M_PORTAL_LOGIN_ACNT" id="M_PORTAL_LOGIN_ACNT" />
  <input name="M_PW" id="M_PW" />
  <input name="M_PW2" id="M_PW2" />
  <img src="/Temp/Captcha/session.png?t=1" id="importantImg" />
  <div id="server-mark">Server:107</div>
</form>
`

describe('portal parser', () => {
  it('extracts ASP.NET login fields and captcha url', () => {
    const challenge = parseAisLoginChallenge(loginHtml)

    expect(challenge.loginUrl).toBe('https://ais.ntou.edu.tw/')
    expect(challenge.captchaUrl).toBe('https://ais.ntou.edu.tw/Temp/Captcha/session.png?t=1')
    expect(challenge.hiddenFields?.__VIEWSTATE).toBe('view')
    expect(challenge.hiddenFields?.__EVENTVALIDATION).toBe('event')
  })

  it('follows only secure AIS client-side queue redirects', () => {
    expect(
      parseAisClientRedirect(
        "<script>location.href='DefaultQ.aspx';</script>",
        'https://ais.ntou.edu.tw/Default.aspx',
      ),
    ).toBe('https://ais.ntou.edu.tw/DefaultQ.aspx')
    expect(
      parseAisClientRedirect(
        "<script>window.location='https://example.com/collect';</script>",
        'https://ais.ntou.edu.tw/Default.aspx',
      ),
    ).toBeUndefined()
  })

  it('treats the returned login form as a failed login', () => {
    expect(parseAisLoginResult(loginHtml).success).toBe(false)
  })

  it('returns the AIS alert message for an invalid captcha', () => {
    const result = parseAisLoginResult(`${loginHtml}<script>alert('驗證碼錯誤，請再重新輸入!!')</script>`)

    expect(result.success).toBe(false)
    expect(result.message).toBe('驗證碼錯誤，請再重新輸入!!')
  })

  it('recognizes the AIS authentication cookie after a successful login', () => {
    expect(hasAisAuthCookie('ASP.NET_SessionId,f5-ltm,.ASPXAUTH,TS01a306fb')).toBe(true)
    expect(hasAisAuthCookie('ASP.NET_SessionId,TS01a306fb')).toBe(false)
  })

  it('parses a profile from protected page text with fallback id', () => {
    const profile = parsePortalProfile('<main>歡迎 王小海 使用系統</main>', '01400000')
    expect(profile.id).toBe('01400000')
    expect(profile.name).toBe('王小海')
  })
})
