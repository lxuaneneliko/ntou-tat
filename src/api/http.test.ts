import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '../types'
import { createHttpApiClient } from './http'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const createMemoryStore = (session: AuthSession | null) => ({
  session,
  async getSession() {
    return this.session
  },
  async saveSession(nextSession: AuthSession) {
    this.session = nextSession
  },
  async clearSession() {
    this.session = null
  },
})

describe('http api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes an expired token once and retries the request', async () => {
    const store = createMemoryStore({
      accessToken: 'expired',
      refreshToken: 'refresh',
      expiresAt: '2026-07-25T00:00:00.000Z',
      profile: {
        id: '01400000',
        name: '林海晴',
        department: '資訊工程學系',
        grade: '三年級',
        avatarInitials: '林',
      },
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accessToken: 'fresh',
          refreshToken: 'refresh-2',
          expiresAt: '2026-07-25T01:00:00.000Z',
          profile: store.session?.profile,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: '01400000',
          name: '林海晴',
          department: '資訊工程學系',
          grade: '三年級',
        }),
      )

    vi.stubGlobal('fetch', fetchMock)
    const api = createHttpApiClient('https://api.example.edu/', store, vi.fn())
    const profile = await api.getMe()

    expect(profile.name).toBe('林海晴')
    expect(store.session?.accessToken).toBe('fresh')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('surfaces server errors without clearing auth', async () => {
    const store = createMemoryStore(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { message: 'server unavailable' })))
    const api = createHttpApiClient('https://api.example.edu/', store, vi.fn())

    await expect(api.getAnnouncements()).rejects.toMatchObject({
      status: 500,
      message: 'server unavailable',
    })
  })
})
