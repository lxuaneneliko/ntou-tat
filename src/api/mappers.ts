import type { AuthSession, Grade, StudentProfile, TimetableResponse, TimetableSlot } from '../types'
import { ApiError } from './errors'

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readString = (record: JsonRecord, key: string, fallback = '') => {
  const value = record[key]
  return typeof value === 'string' ? value : fallback
}

const readNumber = (record: JsonRecord, key: string, fallback = 0) => {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const readBoolean = (record: JsonRecord, key: string, fallback = false) => {
  const value = record[key]
  return typeof value === 'boolean' ? value : fallback
}

const readArray = (record: JsonRecord, key: string) => {
  const value = record[key]
  return Array.isArray(value) ? value : []
}

export const normalizeProfile = (input: unknown): StudentProfile => {
  if (!isRecord(input)) {
    throw new ApiError('學生資料格式不正確', 422, 'INVALID_PROFILE')
  }

  const id = readString(input, 'id')
  const name = readString(input, 'name')
  if (!id || !name) {
    throw new ApiError('學生資料缺少必要欄位', 422, 'INVALID_PROFILE')
  }

  return {
    id,
    name,
    department: readString(input, 'department', '未提供系所'),
    grade: readString(input, 'grade', '未提供年級'),
    className: readString(input, 'className') || undefined,
    email: readString(input, 'email') || undefined,
    avatarInitials: readString(input, 'avatarInitials', name.slice(0, 1)),
  }
}

export const normalizeLoginResponse = (input: unknown): AuthSession => {
  if (!isRecord(input)) {
    throw new ApiError('登入回應格式不正確', 422, 'INVALID_LOGIN_RESPONSE')
  }

  const accessToken = readString(input, 'accessToken')
  const refreshToken = readString(input, 'refreshToken')
  if (!accessToken || !refreshToken) {
    throw new ApiError('登入回應缺少 token', 422, 'INVALID_LOGIN_RESPONSE')
  }

  return {
    accessToken,
    refreshToken,
    expiresAt:
      readString(input, 'expiresAt') ||
      new Date(Date.now() + 1000 * 60 * 45).toISOString(),
    profile: normalizeProfile(input.profile),
  }
}

export const normalizeTimetableResponse = (input: unknown): TimetableResponse => {
  if (!isRecord(input)) {
    throw new ApiError('課表格式不正確', 422, 'INVALID_TIMETABLE')
  }

  const slots = readArray(input, 'slots')
    .filter(isRecord)
    .map((slot, index): TimetableSlot => {
      const courseId = readString(slot, 'courseId', `course-${index + 1}`)
      return {
        id: readString(slot, 'id', `${courseId}-${index + 1}`),
        courseId,
        courseCode: readString(slot, 'courseCode'),
        courseTitle: readString(slot, 'courseTitle', '未命名課程'),
        instructor: readString(slot, 'instructor', '未提供教師'),
        classroom: readString(slot, 'classroom', '未提供教室'),
        day: Math.min(Math.max(Math.trunc(readNumber(slot, 'day', 1)), 1), 7),
        startsAt: readString(slot, 'startsAt', '00:00'),
        endsAt: readString(slot, 'endsAt', '00:00'),
        section: readString(slot, 'section', ''),
        credits: readNumber(slot, 'credits', 0),
        color: readString(slot, 'color', '#0d5f73'),
      }
    })

  return {
    semesterId: readString(input, 'semesterId'),
    updatedAt: readString(input, 'updatedAt', new Date().toISOString()),
    slots,
  }
}

export const normalizeGradesResponse = (input: unknown): Grade[] => {
  const rows = Array.isArray(input) ? input : isRecord(input) ? readArray(input, 'grades') : []

  return rows.filter(isRecord).map((grade, index): Grade => {
    const scoreValue = grade.score
    return {
      id: readString(grade, 'id', `grade-${index + 1}`),
      courseId: readString(grade, 'courseId'),
      courseTitle: readString(grade, 'courseTitle', '未命名課程'),
      semester: readString(grade, 'semester'),
      credits: readNumber(grade, 'credits', 0),
      score: typeof scoreValue === 'number' && Number.isFinite(scoreValue) ? scoreValue : null,
      letter: readString(grade, 'letter') || undefined,
      required: readBoolean(grade, 'required'),
      category: readString(grade, 'category', '其他'),
    }
  })
}

export const normalizeApiError = (status: number, body: unknown) => {
  if (isRecord(body)) {
    return new ApiError(
      readString(body, 'message', 'API 請求失敗'),
      status,
      readString(body, 'code') || undefined,
      body,
    )
  }

  return new ApiError('API 請求失敗', status)
}
