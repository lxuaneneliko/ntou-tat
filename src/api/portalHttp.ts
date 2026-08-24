import { Capacitor, registerPlugin } from '@capacitor/core'
import type { HttpHeaders, HttpOptions } from '@capacitor/core'
import { ApiError } from './errors'

export type PortalResponse = {
  status: number
  data: string
  headers: HttpHeaders
  url: string
  cookieNames?: string
}

const isNative = () => Capacitor.isNativePlatform()
const configuredProxyUrl = import.meta.env.VITE_NTOU_PORTAL_PROXY_URL?.trim()
const shouldUsePortalProxy = () => !isNative() && (import.meta.env.MODE === 'pwa' || Boolean(configuredProxyUrl))
const portalProxyUrl = () => configuredProxyUrl || new URL('/api/portal', window.location.origin).toString()

type NativePortalPlugin = {
  request(options: {
    url: string
    method?: string
    headers?: HttpHeaders
    data?: string
    timeoutMs?: number
  }): Promise<PortalResponse>
  image(options: {
    url: string
    headers?: HttpHeaders
  }): Promise<{
    status: number
    headers: HttpHeaders
    url: string
    dataUrl?: string
  }>
  clear(): Promise<void>
  cacheGet(options: { key: string }): Promise<{ value: string | null }>
  cacheSet(options: { key: string; value: string }): Promise<void>
  cacheClear(): Promise<void>
  openSystemPage(options: { url: string }): Promise<void>
}

const NativePortal = registerPlugin<NativePortalPlugin>('NtouPortal')
const NATIVE_REQUEST_TIMEOUT_MS = 25000

type PortalRequestOptions = HttpOptions & {
  timeoutMs?: number
}

const withNativeTimeout = <T>(promise: Promise<T>, message: string, timeoutMs = NATIVE_REQUEST_TIMEOUT_MS) =>
  new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new ApiError(message, 408, 'PORTAL_TIMEOUT'))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })

const normalizeHeaders = (headers?: HttpHeaders) => headers ?? {}

const readHeader = (headers: HttpHeaders, name: string) => {
  const target = name.toLowerCase()
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target)
  return entry?.[1]
}

const base64FromArrayBuffer = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export const portalRequest = async (options: PortalRequestOptions): Promise<PortalResponse> => {
  if (isNative()) {
    const nativeTimeoutMs = options.timeoutMs ?? NATIVE_REQUEST_TIMEOUT_MS
    return withNativeTimeout(
      NativePortal.request({
        url: options.url,
        method: options.method,
        headers: options.headers,
        data: typeof options.data === 'string' ? options.data : undefined,
        timeoutMs: nativeTimeoutMs,
      }),
      '海大 AIS 連線逾時，請重新整理後再試',
      nativeTimeoutMs + 5000,
    )
  }

  if (shouldUsePortalProxy()) {
    const response = await fetch(portalProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        action: 'request',
        url: options.url,
        method: options.method ?? 'GET',
        headers: normalizeHeaders(options.headers),
        data: typeof options.data === 'string' ? options.data : undefined,
        timeoutMs: options.timeoutMs,
      }),
    })
    const payload = await response.json() as Partial<PortalResponse> & { error?: string; code?: string }
    if (!response.ok) {
      throw new ApiError(
        payload.error || '海大 AIS PWA 連線失敗',
        response.status,
        payload.code || 'PORTAL_PROXY_ERROR',
      )
    }
    return {
      status: payload.status ?? 502,
      data: payload.data ?? '',
      headers: payload.headers ?? {},
      url: payload.url ?? options.url,
      cookieNames: payload.cookieNames,
    }
  }

  const response = await fetch(options.url, {
    method: options.method ?? 'GET',
    headers: normalizeHeaders(options.headers),
    body: typeof options.data === 'string' ? options.data : undefined,
    credentials: 'include',
  })

  return {
    status: response.status,
    data: await response.text(),
    headers: Object.fromEntries(response.headers.entries()),
    url: response.url,
  }
}

export const assertOk = (response: PortalResponse, message: string) => {
  if (response.status < 200 || response.status >= 400) {
    throw new ApiError(message, response.status, 'PORTAL_HTTP_ERROR')
  }
}

const splitSetCookieHeader = (value: string) =>
  value
    .split(/,(?=\s*[\w!#$%&'*+.^`|~-]+=)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean)

const cookieHeaderFromSetCookie = (headers: HttpHeaders) => {
  const setCookie = readHeader(headers, 'set-cookie')
  if (!setCookie) {
    return ''
  }

  return splitSetCookieHeader(setCookie)
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ')
}

export const getPortalCookieHeader = async (responseHeaders?: HttpHeaders) => {
  const cookiesFromHeaders = responseHeaders ? cookieHeaderFromSetCookie(responseHeaders) : ''
  return isNative() ? '' : cookiesFromHeaders
}

export const portalImageDataUrl = async (url: string, referer: string, cookieHeader?: string) => {
  const headers = {
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    Referer: referer,
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  }

  if (isNative()) {
    const response = await withNativeTimeout(
      NativePortal.image({
        url,
        headers,
      }),
      '海大 AIS 驗證碼讀取逾時，請重新整理',
    )
    if (!response.dataUrl) {
      throw new ApiError('海大 AIS 沒有回傳有效的驗證碼圖片', response.status, 'CAPTCHA_IMAGE_INVALID')
    }
    return response.dataUrl
  }

  if (shouldUsePortalProxy()) {
    try {
      const response = await fetch(portalProxyUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'image', url, method: 'GET', headers }),
      })
      const payload = await response.json() as { dataUrl?: string; error?: string; code?: string }
      if (!response.ok) {
        throw new ApiError(
          payload.error || '海大 AIS 驗證碼讀取失敗',
          response.status,
          payload.code || 'PORTAL_PROXY_ERROR',
        )
      }
      return payload.dataUrl
    } catch (error) {
      if (error instanceof ApiError) throw error
      return undefined
    }
  }

  try {
    const response = await fetch(url, { headers, credentials: 'include' })
    if (!response.ok) {
      return undefined
    }
    const contentType = response.headers.get('content-type') || 'image/png'
    const base64 = base64FromArrayBuffer(await response.arrayBuffer())
    return `data:${contentType};base64,${base64}`
  } catch {
    return undefined
  }
}

export const clearPortalCookies = async () => {
  if (shouldUsePortalProxy()) {
    await fetch(portalProxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'clear' }),
    })
    return
  }

  if (!isNative()) {
    return
  }

  await withNativeTimeout(
    NativePortal.clear(),
    '重設海大 AIS 登入狀態逾時，請再試一次',
    8000,
  )
}

export const readEncryptedPortalCache = async (key: string) => {
  if (isNative()) {
    const result = await NativePortal.cacheGet({ key })
    return result.value ?? null
  }
  return localStorage.getItem(key)
}

export const writeEncryptedPortalCache = async (key: string, value: string) => {
  if (isNative()) {
    await NativePortal.cacheSet({ key, value })
    return
  }
  localStorage.setItem(key, value)
}

export const clearEncryptedPortalCache = async () => {
  if (isNative()) {
    await NativePortal.cacheClear()
    return
  }
  Object.keys(localStorage)
    .filter((key) => key.startsWith('ntou_tat_semester_'))
    .forEach((key) => localStorage.removeItem(key))
}

export const launchPortalSystemPage = async (url: string) => {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'ais.ntou.edu.tw') {
    throw new ApiError('校務系統網址不在允許的網域內', 400, 'AIS_SYSTEM_URL_INVALID')
  }

  if (isNative()) {
    await withNativeTimeout(
      NativePortal.openSystemPage({ url: parsed.toString() }),
      '開啟海大校務系統逾時，請再試一次',
      8000,
    )
    return
  }

  window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
}
