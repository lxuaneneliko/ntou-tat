import { describe, expect, it } from 'vitest'
import { encodeTimetableShare } from './timetableShare'
import {
  decodeTimetableShareFromBarcodes,
  galleryImportErrorMessage,
  isGallerySelectionCancelled,
  restoredGalleryImportFromEvent,
} from './timetableQrImport'
import type { TimetableSlot } from './types'

const slot: TimetableSlot = {
  id: 'slot-1',
  courseId: 'course-1',
  courseCode: 'ME123',
  courseTitle: '人工智慧',
  instructor: '王老師',
  classroom: 'INS101',
  day: 1,
  startsAt: '09:20',
  endsAt: '10:10',
  section: '2',
  credits: 3,
  color: '#3288c9',
}

const sharedValue = encodeTimetableShare({
  ownerName: 'A 同學',
  semesterId: '115-1',
  sourceId: 'gallery-test',
  slots: [slot],
})

describe('timetable QR image import', () => {
  it('finds the TAT timetable when an image contains another QR code first', () => {
    const preview = decodeTimetableShareFromBarcodes([
      { rawValue: 'https://example.com' },
      { rawValue: sharedValue },
    ])

    expect(preview.ownerName).toBe('A 同學')
    expect(preview.slots[0].courseTitle).toBe('人工智慧')
  })

  it('uses displayValue when rawValue is missing', () => {
    expect(decodeTimetableShareFromBarcodes([{ displayValue: sharedValue }]).semesterId).toBe('115-1')
  })

  it('uses the caller-specific message when an image has no QR code', () => {
    expect(() => decodeTimetableShareFromBarcodes([], '圖片裡沒有找到 QR Code')).toThrow('圖片裡沒有找到 QR Code')
  })

  it('still rejects images containing only unrelated QR codes', () => {
    expect(() => decodeTimetableShareFromBarcodes([{ rawValue: 'https://example.com' }])).toThrow('不是海大 TAT')
  })

  it('recognizes native and text cancellation signals', () => {
    expect(isGallerySelectionCancelled({ code: 'OS-PLUG-CAMR-0020' })).toBe(true)
    expect(isGallerySelectionCancelled(new Error('User cancelled photos app'))).toBe(true)
    expect(isGallerySelectionCancelled(new Error('The image could not be loaded'))).toBe(false)
  })

  it('translates native gallery and image errors into actionable messages', () => {
    expect(galleryImportErrorMessage({ code: 'OS-PLUG-CAMR-0005' })).toContain('照片權限')
    expect(galleryImportErrorMessage({ code: 'OS-PLUG-CAMR-0027' })).toBe('無法讀取這張圖片，請重新選擇')
    expect(galleryImportErrorMessage({ code: 'OS-PLUG-CAMR-0012' })).toBe('無法讀取這張圖片，請重新選擇')
    expect(galleryImportErrorMessage(new Error('Image could not be loaded'))).toBe('無法讀取這張圖片，請重新選擇')
    expect(galleryImportErrorMessage(new Error('Unknown native error'))).toBe('無法從圖庫辨識 QR Code，請再試一次')
  })

  it('keeps only known user-facing timetable QR validation messages', () => {
    expect(galleryImportErrorMessage(new Error('這不是海大 TAT 的課表 QR Code'))).toBe('這不是海大 TAT 的課表 QR Code')
    expect(galleryImportErrorMessage(new Error('QR Code 資料損毀，請重新產生後再掃描'))).toBe('QR Code 資料損毀，請重新產生後再掃描')
    expect(galleryImportErrorMessage(new Error('圖片裡沒有找到 QR Code，請換一張較清楚的圖片'))).toContain('沒有找到 QR Code')
    expect(galleryImportErrorMessage(new Error('原生內部錯誤：/data/user/0/private.jpg'))).toBe('無法從圖庫辨識 QR Code，請再試一次')
  })

  it('extracts a restored Camera gallery URI and ignores other plugin results', () => {
    const restored = restoredGalleryImportFromEvent({
      pluginId: 'Camera',
      methodName: 'chooseFromGallery',
      success: true,
      data: { results: [{ uri: ' file:///data/user/0/cache/qr.png ' }] },
    })

    expect(restored).toMatchObject({
      kind: 'image',
      imageUri: 'file:///data/user/0/cache/qr.png',
    })
    expect(restoredGalleryImportFromEvent({
      pluginId: 'Camera',
      methodName: 'takePhoto',
      success: true,
    })).toBeNull()
  })

  it('localizes failed or malformed restored gallery results and ignores cancellation', () => {
    expect(restoredGalleryImportFromEvent({
      pluginId: 'Camera',
      methodName: 'chooseFromGallery',
      success: false,
      error: { message: 'Unknown native error' },
    })).toMatchObject({
      kind: 'error',
      message: '無法從圖庫辨識 QR Code，請再試一次',
    })
    expect(restoredGalleryImportFromEvent({
      pluginId: 'Camera',
      methodName: 'chooseFromGallery',
      success: true,
      data: { results: [] },
    })).toMatchObject({
      kind: 'error',
      message: '無法讀取這張圖片，請重新選擇',
    })
    expect(restoredGalleryImportFromEvent({
      pluginId: 'Camera',
      methodName: 'chooseFromGallery',
      success: false,
      error: { message: 'User cancelled gallery' },
    })).toBe('cancelled')
  })
})
