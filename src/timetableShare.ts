import { deflate, inflate } from 'pako'
import type { TimetableSlot } from './types'

const QR_PREFIX = 'NTOUTAT-TT1.'
const SHARED_TIMETABLES_STORAGE_KEY = 'ntou_shared_timetables_v1'
const SHARE_SOURCE_STORAGE_KEY = 'ntou_timetable_share_source_v1'
const MAX_SLOTS = 80

type CompactSlot = [
  code: string,
  title: string,
  instructor: string,
  classroom: string,
  day: number,
  section: string,
  startsAt: string,
  endsAt: string,
  credits: number,
  color: string,
]

type CompactTimetablePayload = {
  v: 1
  i: string
  n: string
  s: string
  g: number
  c: CompactSlot[]
}

export type SharedTimetable = {
  id: string
  sourceId: string
  displayName: string
  ownerName: string
  semesterId: string
  generatedAt: string
  importedAt: string
  slots: TimetableSlot[]
}

export type TimetableSharePreview = Omit<SharedTimetable, 'displayName' | 'importedAt'>

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const safeColor = (value: unknown) => {
  const color = cleanText(value, 24)
  return /^(#[0-9a-f]{3,8}|rgb\(|hsl\()/i.test(color) ? color : '#3288c9'
}

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const makeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export const getOrCreateTimetableShareSourceId = () => {
  try {
    const stored = cleanText(localStorage.getItem(SHARE_SOURCE_STORAGE_KEY), 80)
    if (stored) return stored
    const sourceId = makeId()
    localStorage.setItem(SHARE_SOURCE_STORAGE_KEY, sourceId)
    return sourceId
  } catch {
    return makeId()
  }
}

export const encodeTimetableShare = ({
  ownerName,
  semesterId,
  slots,
  sourceId = getOrCreateTimetableShareSourceId(),
}: {
  ownerName: string
  semesterId: string
  slots: TimetableSlot[]
  sourceId?: string
}) => {
  const safeOwnerName = cleanText(ownerName, 30)
  const safeSemesterId = cleanText(semesterId, 24)
  if (!safeOwnerName) throw new Error('請先輸入課表名稱')
  if (!safeSemesterId) throw new Error('找不到要分享的學期')
  if (!slots.length) throw new Error('這個學期目前沒有可分享的課程')
  if (slots.length > MAX_SLOTS) throw new Error('課程資料太多，暫時無法產生 QR Code')

  const payload: CompactTimetablePayload = {
    v: 1,
    i: cleanText(sourceId, 80) || makeId(),
    n: safeOwnerName,
    s: safeSemesterId,
    g: Date.now(),
    c: slots.map((slot) => [
      cleanText(slot.courseCode, 40),
      cleanText(slot.courseTitle, 100),
      cleanText(slot.instructor, 60),
      cleanText(slot.classroom, 80),
      Number.isInteger(slot.day) ? slot.day : 0,
      cleanText(slot.section, 40),
      cleanText(slot.startsAt, 12),
      cleanText(slot.endsAt, 12),
      Number.isFinite(slot.credits) ? slot.credits : 0,
      safeColor(slot.color),
    ]),
  }

  const compressed = deflate(new TextEncoder().encode(JSON.stringify(payload)), { level: 9 })
  return `${QR_PREFIX}${bytesToBase64Url(compressed)}`
}

const isCompactSlot = (value: unknown): value is CompactSlot =>
  Array.isArray(value) &&
  value.length === 10 &&
  value.slice(0, 4).every((field) => typeof field === 'string') &&
  typeof value[4] === 'number' &&
  value.slice(5, 8).every((field) => typeof field === 'string') &&
  typeof value[8] === 'number' &&
  typeof value[9] === 'string'

export const decodeTimetableShare = (rawValue: string): TimetableSharePreview => {
  const value = rawValue.trim()
  if (!value.startsWith(QR_PREFIX)) throw new Error('這不是海大 TAT 的課表 QR Code')

  let payload: CompactTimetablePayload
  try {
    const json = new TextDecoder().decode(inflate(base64UrlToBytes(value.slice(QR_PREFIX.length))))
    payload = JSON.parse(json) as CompactTimetablePayload
  } catch {
    throw new Error('QR Code 資料損毀，請重新產生後再掃描')
  }

  if (
    payload.v !== 1 ||
    !cleanText(payload.i, 80) ||
    !cleanText(payload.n, 30) ||
    !cleanText(payload.s, 24) ||
    !Number.isFinite(payload.g) ||
    !Array.isArray(payload.c) ||
    payload.c.length === 0 ||
    payload.c.length > MAX_SLOTS ||
    !payload.c.every(isCompactSlot)
  ) {
    throw new Error('這份課表 QR Code 格式不完整')
  }

  const sourceId = cleanText(payload.i, 80)
  const semesterId = cleanText(payload.s, 24)
  const recordId = `${sourceId}:${semesterId}`
  const slots = payload.c.map((slot, index): TimetableSlot => ({
    id: `shared-${recordId}-${index}`,
    courseId: `shared-${recordId}-${cleanText(slot[0], 40) || index}`,
    courseCode: cleanText(slot[0], 40),
    courseTitle: cleanText(slot[1], 100) || '未命名課程',
    instructor: cleanText(slot[2], 60),
    classroom: cleanText(slot[3], 80),
    day: Math.min(7, Math.max(0, Math.trunc(slot[4]))),
    section: cleanText(slot[5], 40),
    startsAt: cleanText(slot[6], 12),
    endsAt: cleanText(slot[7], 12),
    credits: Number.isFinite(slot[8]) ? Math.max(0, slot[8]) : 0,
    color: safeColor(slot[9]),
  }))

  return {
    id: recordId,
    sourceId,
    ownerName: cleanText(payload.n, 30),
    semesterId,
    generatedAt: new Date(payload.g).toISOString(),
    slots,
  }
}

const isSharedTimetable = (value: unknown): value is SharedTimetable => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SharedTimetable>
  return Boolean(
    cleanText(item.id, 120) &&
    cleanText(item.sourceId, 80) &&
    cleanText(item.displayName, 40) &&
    cleanText(item.ownerName, 30) &&
    cleanText(item.semesterId, 24) &&
    cleanText(item.generatedAt, 40) &&
    cleanText(item.importedAt, 40) &&
    Array.isArray(item.slots) &&
    item.slots.length <= MAX_SLOTS,
  )
}

export const readSharedTimetables = (): SharedTimetable[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_TIMETABLES_STORAGE_KEY) || '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter(isSharedTimetable) : []
  } catch {
    return []
  }
}

export const writeSharedTimetables = (items: SharedTimetable[]) => {
  localStorage.setItem(SHARED_TIMETABLES_STORAGE_KEY, JSON.stringify(items))
}

export const importTimetablePreview = (
  preview: TimetableSharePreview,
  displayName: string,
): SharedTimetable => ({
  ...preview,
  displayName: cleanText(displayName, 40) || preview.ownerName,
  importedAt: new Date().toISOString(),
})
