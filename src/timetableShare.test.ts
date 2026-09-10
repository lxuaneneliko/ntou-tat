import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deflate, inflate } from 'pako'
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

const decodePayload = (value: string) => {
  const base64 = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return JSON.parse(new TextDecoder().decode(inflate(Uint8Array.from(binary, (character) => character.charCodeAt(0)))))
}

const encodePayload = (payload: unknown) => {
  const bytes = deflate(new TextEncoder().encode(JSON.stringify(payload)))
  const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `NTOUTAT-TT1.${base64}`
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

  it('preserves Saturday and Sunday courses in a QR timetable snapshot', () => {
    const encoded = encodeTimetableShare({
      ownerName: '週末課表',
      semesterId: '115-1',
      sourceId: 'weekend-device',
      slots: [
        { ...slot, id: 'saturday', day: 6 },
        { ...slot, id: 'sunday', courseId: 'course-2', day: 7 },
      ],
    })

    expect(decodeTimetableShare(encoded).slots.map((item) => item.day)).toEqual([6, 7])
  })

  it('shares a multi-day custom course without combining other courses with the same code or title', () => {
    const encoded = encodeTimetableShare({
      ownerName: '同學',
      semesterId: '115-1',
      sourceId: 'anonymous-device',
      slots: [
        { ...slot, id: 'mon-2', courseId: 'custom-a', courseCode: 'CUSTOM', day: 1, section: '2' },
        { ...slot, id: 'fri-3', courseId: 'custom-a', courseCode: 'CUSTOM', day: 5, section: '3' },
        { ...slot, id: 'fri-4', courseId: 'custom-a', courseCode: 'CUSTOM', day: 5, section: '4' },
        { ...slot, id: 'other', courseId: 'custom-b', courseCode: 'CUSTOM', day: 3, section: '5' },
      ],
    })
    const decoded = decodeTimetableShare(encoded).slots

    expect(decoded.map(({ day, section }) => [day, section])).toEqual([
      [1, '2'], [5, '3'], [5, '4'], [3, '5'],
    ])
    expect(new Set(decoded.slice(0, 3).map((item) => item.courseId)).size).toBe(1)
    expect(decoded[3].courseId).not.toBe(decoded[0].courseId)

    const payload = decodePayload(encoded)
    expect(payload.k).toEqual([0, 0, 0, 1])
    // Older apps enforce ten fields per tuple, but ignore unknown top-level fields.
    expect(payload.c.every((item: unknown[]) => item.length === 10)).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('custom-a')
    expect(JSON.stringify(payload)).not.toContain('custom-b')
  })

  it('continues reading legacy TT1 QR codes without an explicit course-group array', () => {
    const legacyPayload = {
      v: 1,
      i: 'legacy-device',
      n: '舊版課表',
      s: '114-2',
      g: Date.UTC(2026, 0, 1),
      c: [
        ['ME123', '工程數學', '王老師', 'MEB429', 1, '2', '09:20', '10:10', 2, '#176db9'],
        ['ME123', '工程數學', '王老師', 'MEB429', 5, '3', '10:20', '11:10', 2, '#176db9'],
      ],
    }
    const decoded = decodeTimetableShare(encodePayload(legacyPayload))

    expect(decoded.slots.map((item) => item.day)).toEqual([1, 5])
    expect(decoded.slots[0].courseId).toBe('shared-legacy-device:114-2-ME123')
    expect(decoded.slots[1].courseId).toBe(decoded.slots[0].courseId)
  })

  it.each([null, [], [-1], [0.5], ['0'], [80], [0, 1]].map((groups) => ({ groups })))('rejects invalid course groups ($groups)', ({ groups }) => {
    const payload = decodePayload(encodeTimetableShare({
      ownerName: '同學', semesterId: '115-1', sourceId: 'device', slots: [slot],
    }))
    payload.k = groups
    expect(() => decodeTimetableShare(encodePayload(payload))).toThrow('格式不完整')
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
