import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decodeTimetableShare,
  encodeTimetableShare,
  importTimetablePreview,
  readSharedTimetables,
  writeSharedTimetables,
} from './timetableShare'
import type { TimetableSlot } from './types'

const slot: TimetableSlot = {
  id: 'slot-1',
  courseId: 'course-1',
  courseCode: 'B57012',
  courseTitle: '資料結構',
  instructor: '王老師',
  classroom: '電資大樓 101',
  day: 2,
  startsAt: '10:20',
  endsAt: '12:10',
  section: '3,4',
  credits: 3,
  color: '#3288c9',
}

describe('timetable QR sharing', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    })
  })

  it('round-trips a timetable snapshot without exposing the student id', () => {
    const encoded = encodeTimetableShare({
      ownerName: '小海的課表',
      semesterId: '115-1',
      sourceId: 'device-anonymous-id',
      slots: [slot],
    })
    const decoded = decodeTimetableShare(encoded)

    expect(encoded).toMatch(/^NTOUTAT-TT1\./)
    expect(encoded).not.toContain('B57012')
    expect(decoded.ownerName).toBe('小海的課表')
    expect(decoded.semesterId).toBe('115-1')
    expect(decoded.slots[0]).toMatchObject({
      courseCode: 'B57012',
      courseTitle: '資料結構',
      instructor: '王老師',
      classroom: '電資大樓 101',
      day: 2,
      section: '3,4',
    })
  })

  it('rejects unrelated QR codes', () => {
    expect(() => decodeTimetableShare('https://example.com')).toThrow('不是海大 TAT')
  })

  it('stores imported timetables locally', () => {
    const preview = decodeTimetableShare(encodeTimetableShare({
      ownerName: 'A 同學',
      semesterId: '115-1',
      sourceId: 'friend-a',
      slots: [slot],
    }))
    writeSharedTimetables([importTimetablePreview(preview, '專題夥伴 A')])
    expect(readSharedTimetables()[0].displayName).toBe('專題夥伴 A')
  })
})
