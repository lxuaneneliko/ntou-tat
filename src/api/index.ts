import { authStore } from '../storage/authStorage'
import type { NtouApi } from './contract'
import { createHttpApiClient } from './http'
import { createMockApiClient } from './mock'
import { createPortalApiClient } from './portal'

const configuredBaseUrl = import.meta.env.VITE_NTOU_API_BASE_URL?.trim()
const configuredMode = import.meta.env.VITE_NTOU_AUTH_MODE?.trim()

export const apiMode = configuredBaseUrl ? 'live' : configuredMode === 'mock' ? 'mock' : 'portal'

export const createNtouApi = (onUnauthorized: () => void): NtouApi => {
  if (configuredBaseUrl) {
    return createHttpApiClient(configuredBaseUrl, authStore, onUnauthorized)
  }

  if (apiMode === 'mock') {
    return createMockApiClient()
  }

  return createPortalApiClient(authStore)
}
