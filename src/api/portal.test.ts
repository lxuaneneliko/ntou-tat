import { describe, expect, it } from 'vitest'
import type { LoginChallenge } from '../types'
import { buildLoginBody } from './portal'

describe('AIS login request', () => {
  it('uses the field names parsed from the current AIS login form', () => {
    const challenge: LoginChallenge = {
      id: 'current-form',
      source: 'portal',
      loginUrl: 'https://ais.ntou.edu.tw/',
      hiddenFields: { __VIEWSTATE: 'view', __EVENTVALIDATION: 'event' },
      fieldNames: {
        account: 'M_PORTAL_LOGIN_ACNT',
        password: 'LoginPWD',
        captcha: 'M_PW2',
      },
      submitName: 'LGOIN_BTN',
      submitValue: '登入/Login',
    }

    const body = new URLSearchParams(buildLoginBody({
      studentId: '01400000',
      password: 'case-sensitive-password',
      captchaCode: 'Ab3D',
      challenge,
    }, challenge))

    expect(body.get('M_PORTAL_LOGIN_ACNT')).toBe('01400000')
    expect(body.get('LoginPWD')).toBe('case-sensitive-password')
    expect(body.get('M_PW2')).toBe('Ab3D')
    expect(body.has('M_PW')).toBe(false)
    expect(body.get('__VIEWSTATE')).toBe('view')
  })

  it('keeps the legacy password field fallback for older challenges', () => {
    const challenge: LoginChallenge = {
      id: 'legacy-form',
      source: 'portal',
      loginUrl: 'https://ais.ntou.edu.tw/',
    }
    const body = new URLSearchParams(buildLoginBody({
      studentId: '01400000',
      password: 'password',
      captchaCode: 'A1B2',
      challenge,
    }, challenge))

    expect(body.get('M_PW')).toBe('password')
  })
})
