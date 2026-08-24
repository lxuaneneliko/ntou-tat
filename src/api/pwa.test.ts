import { describe, expect, it } from 'vitest'
import { createPwaApiClient, PWA_SESSION_TOKEN } from './pwa'

describe('PWA local login', () => {
  it('creates a local profile for the entered student id', async () => {
    const api = createPwaApiClient()
    const session = await api.login({ studentId: '01472014', password: '' })

    expect(session.accessToken).toBe(PWA_SESSION_TOKEN)
    expect(session.source).toBe('pwa')
    expect(session.profile).toMatchObject({
      id: '01472014',
      name: '海大學生',
      avatarInitials: '14',
    })
    await expect(api.getMe()).resolves.toEqual(session.profile)
  })

  it('trims the local student id before saving it', async () => {
    const api = createPwaApiClient()
    const session = await api.login({ studentId: ' 01472014 ', password: '' })

    expect(session.profile.id).toBe('01472014')
  })
})
