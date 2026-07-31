import { authStore } from '../storage/authStorage'
import { credentialsStore } from '../storage/credentialsStorage'
import type { NtouApi } from './contract'
import { createHttpApiClient } from './http'
import { createMockApiClient } from './mock'
import { createPortalApiClient } from './portal'
import { UnauthorizedError } from './errors'
import { recognizeCaptcha } from '../utils/ocr'

const configuredBaseUrl = import.meta.env.VITE_NTOU_API_BASE_URL?.trim()
const configuredMode = import.meta.env.VITE_NTOU_AUTH_MODE?.trim()

export const apiMode = configuredBaseUrl ? 'live' : configuredMode === 'mock' ? 'mock' : 'portal'

// Wrap an API object to automatically perform login retry using secure credentials
function withAutoLogin(api: NtouApi, onUnauthorized: () => void): NtouApi {
  const wrappedApi = { ...api }

  const wrapMethod = (methodName: keyof NtouApi) => {
    const originalMethod = api[methodName] as any
    if (typeof originalMethod !== 'function' || methodName === 'login' || methodName === 'getLoginChallenge') {
      return
    }

    wrappedApi[methodName] = async (...args: any[]) => {
      try {
        return await originalMethod.apply(api, args)
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          // Attempt auto-login
          const credentials = await credentialsStore.getCredentials()
          if (!credentials || !api.getLoginChallenge) {
            onUnauthorized()
            throw error
          }

          console.log('[AutoLogin] Unauthorized error detected, attempting auto-login...')
          let loginSuccess = false
          
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const challenge = await api.getLoginChallenge()
              if (!challenge.captchaDataUrl) {
                throw new Error('No captcha data url')
              }
              const captchaCode = await recognizeCaptcha(challenge.captchaDataUrl)
              console.log(`[AutoLogin] OCR Result: ${captchaCode}`)
              
              const session = await api.login({
                studentId: credentials.studentId,
                password: credentials.password,
                captchaCode,
                challenge
              })
              await authStore.saveSession(session)
              loginSuccess = true
              break
            } catch (loginErr) {
              console.warn(`[AutoLogin] Attempt ${attempt + 1} failed:`, loginErr)
            }
          }

          if (loginSuccess) {
            console.log('[AutoLogin] Success! Retrying original request.')
            return await originalMethod.apply(api, args)
          } else {
            console.warn('[AutoLogin] Failed after max attempts.')
            onUnauthorized()
            throw new UnauthorizedError('CAPTCHA_FAILED')
          }
        }
        throw error
      }
    }
  }

  for (const key of Object.keys(api) as (keyof NtouApi)[]) {
    wrapMethod(key)
  }

  return wrappedApi
}

export const createNtouApi = (onUnauthorized: () => void): NtouApi => {
  let baseApi: NtouApi
  
  if (configuredBaseUrl) {
    baseApi = createHttpApiClient(configuredBaseUrl, authStore, onUnauthorized)
  } else if (apiMode === 'mock') {
    baseApi = createMockApiClient()
  } else {
    baseApi = createPortalApiClient(authStore)
  }

  // Only apply auto-login wrapper if it's the portal mode, as mock doesn't need it
  if (apiMode === 'portal') {
    return withAutoLogin(baseApi, onUnauthorized)
  }

  return baseApi
}
