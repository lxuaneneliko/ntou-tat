/// <reference types="node" />

import type { IncomingMessage, ServerResponse } from 'node:http'
import { processPortalProxy, type PortalProxyInput } from '../server/portalProxy.js'

const SESSION_COOKIE = '__Host-ntou_portal_session'
const MAX_BODY_BYTES = 256 * 1024

type VercelRequest = IncomingMessage & { body?: unknown }

const parseCookies = (header: string | undefined) =>
  Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=')
        return separator < 0
          ? [decodeURIComponent(part), '']
          : [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))]
      }),
  )

const readJsonBody = async (request: VercelRequest) => {
  if (request.body && typeof request.body === 'object') return request.body as PortalProxyInput
  if (typeof request.body === 'string') return JSON.parse(request.body) as PortalProxyInput

  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > MAX_BODY_BYTES) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as PortalProxyInput
}

const sameOriginRequest = (request: IncomingMessage) => {
  const origin = request.headers.origin
  if (!origin) return true
  const forwardedHost = request.headers['x-forwarded-host']
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

const sendJson = (response: ServerResponse, status: number, body: unknown) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(body))
}

export default async function handler(request: VercelRequest, response: ServerResponse) {
  if (request.method === 'GET') {
    return sendJson(response, 200, { ok: true, service: 'ntou-portal-proxy' })
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST')
    return sendJson(response, 405, { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
  }
  if (!sameOriginRequest(request)) {
    return sendJson(response, 403, { error: 'Cross-origin request rejected', code: 'ORIGIN_REJECTED' })
  }

  try {
    const input = await readJsonBody(request)
    if (!input || !['request', 'image', 'clear'].includes(input.action)) {
      return sendJson(response, 400, { error: 'Invalid portal action', code: 'INVALID_ACTION' })
    }

    const currentToken = parseCookies(request.headers.cookie)[SESSION_COOKIE]
    const result = await processPortalProxy(
      input,
      currentToken,
      process.env.PORTAL_SESSION_SECRET ?? '',
    )

    if (result.clearSession) {
      response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
    } else if (result.sessionToken) {
      response.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${encodeURIComponent(result.sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`,
      )
    }
    return sendJson(response, result.httpStatus, result.body)
  } catch {
    return sendJson(response, 400, { error: 'Invalid JSON request', code: 'INVALID_REQUEST' })
  }
}
