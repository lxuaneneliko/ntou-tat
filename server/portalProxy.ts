/// <reference types="node" />

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { CookieJar, type SerializedCookieJar } from 'tough-cookie'

const AIS_HOST = 'ais.ntou.edu.tw'
const PUBLIC_HOST = 'www.ntou.edu.tw'
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000
const MAX_REDIRECTS = 8
const MAX_SESSION_TOKEN_LENGTH = 3_800
const CAPTCHA_PLACEHOLDER_PATH = '/__ntou_tat_captcha__'

export type PortalProxyInput = {
  action: 'request' | 'image' | 'clear'
  url?: string
  method?: string
  headers?: Record<string, string | string[]>
  data?: string
  timeoutMs?: number
}

export type PortalProxyBody = {
  status?: number
  data?: string
  dataUrl?: string
  headers?: Record<string, string>
  url?: string
  cookieNames?: string
  error?: string
  code?: string
}

export type PortalProxyResult = {
  httpStatus: number
  body: PortalProxyBody
  sessionToken?: string
  clearSession?: boolean
}

type SessionEnvelope = {
  expiresAt: number
  jar: SerializedCookieJar
}

type FetchLike = typeof fetch

const keyFromSecret = (secret: string) => createHash('sha256').update(secret).digest()

export const sealPortalSession = (jar: CookieJar, secret: string, now = Date.now()) => {
  const serializedJar = jar.serializeSync()
  if (!serializedJar) {
    throw new Error('Unable to serialize AIS session')
  }
  const envelope: SessionEnvelope = {
    expiresAt: now + SESSION_LIFETIME_MS,
    jar: serializedJar,
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv)
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(envelope), 'utf8'))
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()])
  const tag = cipher.getAuthTag()
  const token = Buffer.concat([iv, tag, encrypted]).toString('base64url')
  if (token.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error('AIS session is too large to store securely')
  }
  return token
}

export const openPortalSession = (token: string | undefined, secret: string, now = Date.now()) => {
  if (!token) return new CookieJar()

  try {
    const packed = Buffer.from(token, 'base64url')
    if (packed.length < 29) return new CookieJar()
    const iv = packed.subarray(0, 12)
    const tag = packed.subarray(12, 28)
    const encrypted = packed.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), iv)
    decipher.setAuthTag(tag)
    const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()])
    const envelope = JSON.parse(inflateRawSync(compressed).toString('utf8')) as SessionEnvelope
    if (!envelope.expiresAt || envelope.expiresAt <= now || !envelope.jar) {
      return new CookieJar()
    }
    return CookieJar.deserializeSync(envelope.jar)
  } catch {
    return new CookieJar()
  }
}

export const assertAllowedPortalUrl = (rawUrl: string, method = 'GET') => {
  const url = new URL(rawUrl)
  const normalizedMethod = method.toUpperCase()
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Only HTTPS NTOU URLs are allowed')
  }
  if (url.hostname !== AIS_HOST && url.hostname !== PUBLIC_HOST) {
    throw new Error('The requested host is not allowed')
  }
  if (url.hostname === PUBLIC_HOST && normalizedMethod !== 'GET') {
    throw new Error('Only GET is allowed for the public NTOU site')
  }
  return url
}

const safeTimeout = (timeoutMs?: number) => Math.min(Math.max(timeoutMs ?? 25_000, 5_000), 75_000)

const splitSetCookieHeader = (value: string) =>
  value
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean)

const responseSetCookies = (headers: Headers) => {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] }
  const cookies = extendedHeaders.getSetCookie?.()
  if (cookies?.length) return cookies
  const combined = headers.get('set-cookie')
  return combined ? splitSetCookieHeader(combined) : []
}

const responseHeaders = (headers: Headers) => {
  const result: Record<string, string> = {}
  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase() !== 'set-cookie') result[name] = value
  }
  return result
}

const safeRequestHeaders = (
  input: Record<string, string | string[]> | undefined,
  url: URL,
) => {
  const source = new Headers()
  for (const [name, value] of Object.entries(input ?? {})) {
    source.set(name, Array.isArray(value) ? value.join(', ') : value)
  }

  const headers = new Headers({
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 NTOU-TAT-PWA/1.0',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  })
  for (const name of ['accept', 'content-type', 'x-requested-with']) {
    const value = source.get(name)
    if (value) headers.set(name, value)
  }

  const referer = source.get('referer')
  if (referer) {
    try {
      const parsed = assertAllowedPortalUrl(referer, 'GET')
      headers.set('Referer', parsed.toString())
    } catch {
      // Invalid caller-supplied referers are intentionally discarded.
    }
  }
  if (url.hostname === AIS_HOST && source.has('origin')) {
    headers.set('Origin', `https://${AIS_HOST}`)
  }
  return headers
}

const decodeText = (bytes: Uint8Array, contentType: string | null) => {
  const charset = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1]?.toLowerCase()
  const encodings = [charset, 'utf-8', 'big5'].filter(Boolean) as string[]
  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding, { fatal: encoding !== 'utf-8' }).decode(bytes)
    } catch {
      // Try the next supported encoding.
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

const injectCaptchaPlaceholder = (html: string) =>
  html.replace(/<img\b(?=[^>]*\bid=["']importantImg["'])[^>]*>/i, (tag) => {
    if (/\bsrc\s*=/i.test(tag)) {
      return tag.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${CAPTCHA_PLACEHOLDER_PATH}"`)
    }
    const closing = /\/\s*>$/.test(tag) ? '/>' : '>'
    return `${tag.slice(0, tag.lastIndexOf(closing)).trimEnd()} src="${CAPTCHA_PLACEHOLDER_PATH}" ${closing}`
  })

const resolveCaptchaPlaceholder = async (url: URL, jar: CookieJar) => {
  if (url.hostname !== AIS_HOST || url.pathname !== CAPTCHA_PLACEHOLDER_PATH) return url
  const cookies = await jar.getCookies(`https://${AIS_HOST}/`)
  const sessionId = cookies.find((cookie) => cookie.key === 'ASP.NET_SessionId')?.value
  if (!sessionId || !/^[a-z0-9]+$/i.test(sessionId)) {
    throw new Error('AIS CAPTCHA session is unavailable')
  }
  return new URL(`/Temp/Captcha/${encodeURIComponent(sessionId)}.png?t=${Date.now()}`, `https://${AIS_HOST}/`)
}

type UpstreamResult = {
  status: number
  url: string
  headers: Headers
  bytes: Uint8Array
  cookieNames: string
}

const executeUpstream = async (
  input: PortalProxyInput,
  jar: CookieJar,
  fetchImpl: FetchLike,
): Promise<UpstreamResult> => {
  let method = (input.method ?? 'GET').toUpperCase()
  if (!['GET', 'POST', 'HEAD'].includes(method)) {
    throw new Error('The requested method is not allowed')
  }
  let url = await resolveCaptchaPlaceholder(assertAllowedPortalUrl(input.url ?? '', method), jar)
  let body = method === 'POST' ? input.data ?? '' : undefined

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const headers = safeRequestHeaders(input.headers, url)
    if (url.hostname === AIS_HOST) {
      const cookie = await jar.getCookieString(url.toString())
      if (cookie) headers.set('Cookie', cookie)
    }

    const response = await fetchImpl(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(safeTimeout(input.timeoutMs)),
    })
    for (const cookie of responseSetCookies(response.headers)) {
      await jar.setCookie(cookie, url.toString(), { ignoreError: true })
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (location && redirectCount < MAX_REDIRECTS) {
        const nextUrl = await resolveCaptchaPlaceholder(
          assertAllowedPortalUrl(new URL(location, url).toString(), method),
          jar,
        )
        if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) {
          method = 'GET'
          body = undefined
        }
        url = nextUrl
        continue
      }
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    const cookies = await jar.getCookies(`https://${AIS_HOST}/`)
    return {
      status: response.status,
      url: response.url || url.toString(),
      headers: response.headers,
      bytes,
      cookieNames: cookies.map((cookie) => cookie.key).join(','),
    }
  }

  throw new Error('AIS returned too many redirects')
}

export const processPortalProxy = async (
  input: PortalProxyInput,
  sessionToken: string | undefined,
  secret: string,
  fetchImpl: FetchLike = fetch,
): Promise<PortalProxyResult> => {
  if (!secret || secret.length < 32) {
    return {
      httpStatus: 503,
      body: { error: 'PWA login service is not configured', code: 'PORTAL_PROXY_NOT_CONFIGURED' },
    }
  }
  if (input.action === 'clear') {
    return { httpStatus: 200, body: { status: 200 }, clearSession: true }
  }

  try {
    const target = assertAllowedPortalUrl(input.url ?? '', input.method ?? 'GET')
    const jar = openPortalSession(sessionToken, secret)
    const upstream = await executeUpstream(input, jar, fetchImpl)
    const contentType = upstream.headers.get('content-type')
    const decodedData = input.action === 'request'
      ? injectCaptchaPlaceholder(decodeText(upstream.bytes, contentType))
      : undefined
    const body: PortalProxyBody = input.action === 'image'
      ? {
          status: upstream.status,
          headers: responseHeaders(upstream.headers),
          url: upstream.url,
          cookieNames: upstream.cookieNames,
          ...(contentType?.toLowerCase().startsWith('image/')
            ? { dataUrl: `data:${contentType.split(';')[0]};base64,${Buffer.from(upstream.bytes).toString('base64')}` }
            : {}),
        }
      : {
          status: upstream.status,
          data: decodedData,
          headers: responseHeaders(upstream.headers),
          url: upstream.url,
          cookieNames: upstream.cookieNames,
        }

    return {
      httpStatus: 200,
      body,
      sessionToken: target.hostname === AIS_HOST ? sealPortalSession(jar, secret) : undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AIS proxy request failed'
    const blocked = /not allowed|Only HTTPS|method/i.test(message)
    return {
      httpStatus: blocked ? 400 : 502,
      body: {
        error: blocked ? message : '海大 AIS 連線失敗，請稍後再試',
        code: blocked ? 'PORTAL_PROXY_REQUEST_REJECTED' : 'PORTAL_PROXY_UPSTREAM_FAILED',
      },
    }
  }
}
