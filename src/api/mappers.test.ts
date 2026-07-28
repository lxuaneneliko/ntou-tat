import { describe, expect, it } from 'vitest'
import { normalizeApiError, normalizeGradesResponse, normalizeLoginResponse, normalizeTimetableResponse } from './mappers'

describe('api mappers', () => {
  it('normalizes a login response with profile data', () => {
    const session = normalizeLoginResponse({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: '2026-07-25T00:00:00.000Z',
      profile: {
        id: '01400000',
        name: '林海晴',
        department: '資訊工程學系',
        grade: '三年級',
      },
    })

    expect(session.accessToken).toBe('access')
    expect(session.profile.avatarInitials).toBe('林')
  })

  it('rejects missing tokens', () => {
    expect(() => normalizeLoginResponse({ profile: { id: '1', name: 'Test' } })).toThrow(
      '登入回應缺少 token',
    )
  })

  it('normalizes timetable rows and clamps invalid day values', () => {
    const timetable = normalizeTimetableResponse({
      semesterId: '114-2',
      slots: [
        {
          courseId: 'cs301',
          courseTitle: '演算法',
          day: 9,
          startsAt: '10:20',
          endsAt: '12:10',
        },
      ],
    })

    expect(timetable.slots).toHaveLength(1)
    expect(timetable.slots[0].day).toBe(7)
    expect(timetable.slots[0].instructor).toBe('未提供教師')
  })

  it('normalizes empty and partial grades', () => {
    expect(normalizeGradesResponse({ grades: [] })).toEqual([])
    expect(
      normalizeGradesResponse({
        grades: [{ courseTitle: '資料結構', credits: 3, score: 91 }],
      })[0].score,
    ).toBe(91)
  })

  it('normalizes server errors', () => {
    const error = normalizeApiError(500, { message: 'server unavailable', code: 'SERVER_ERROR' })
    expect(error.status).toBe(500)
    expect(error.code).toBe('SERVER_ERROR')
  })
})
