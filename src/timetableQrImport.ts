import {
  decodeTimetableShare,
  type TimetableSharePreview,
} from './timetableShare'

export type TimetableBarcodeCandidate = {
  rawValue?: string | null
  displayValue?: string | null
}

export type RestoredGalleryImport =
  | { kind: 'image'; requestId: string; imageUri: string }
  | { kind: 'error'; requestId: string; message: string }

type RestoredPluginResult = {
  pluginId?: unknown
  methodName?: unknown
  success?: unknown
  data?: unknown
  error?: unknown
}

const SAFE_QR_MESSAGES = new Set([
  '這不是海大 TAT 的課表 QR Code',
  'QR Code 資料損毀，請重新產生後再掃描',
  '這份課表 QR Code 格式不完整',
])

const GALLERY_IMAGE_ERROR_CODES = new Set([
  'OS-PLUG-CAMR-0008',
  'OS-PLUG-CAMR-0011',
  'OS-PLUG-CAMR-0012',
  'OS-PLUG-CAMR-0018',
  'OS-PLUG-CAMR-0021',
  'OS-PLUG-CAMR-0027',
  'OS-PLUG-CAMR-0028',
])

const errorCode = (error: unknown) => (
  error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
)

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '')
  }
  return typeof error === 'string' ? error : ''
}

const barcodeText = (barcode: TimetableBarcodeCandidate) =>
  (barcode.rawValue || barcode.displayValue || '').trim()

export const decodeTimetableShareFromBarcodes = (
  barcodes: TimetableBarcodeCandidate[],
  emptyMessage = '沒有讀到 QR Code 內容，請再試一次',
): TimetableSharePreview => {
  const values = barcodes.map(barcodeText).filter(Boolean)
  if (!values.length) throw new Error(emptyMessage)

  let lastError: unknown
  for (const value of values) {
    try {
      return decodeTimetableShare(value)
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error('這不是海大 TAT 的課表 QR Code')
}

export const isGallerySelectionCancelled = (error: unknown) => {
  if (errorCode(error) === 'OS-PLUG-CAMR-0020') return true
  const message = errorMessage(error)
  return /cancel|canceled|cancelled|取消/i.test(message)
}

export const galleryImportErrorMessage = (error: unknown) => {
  const code = errorCode(error)
  const message = errorMessage(error).trim()

  if (code === 'OS-PLUG-CAMR-0005') {
    return '無法存取照片圖庫，請允許照片權限後再試一次'
  }
  if (
    GALLERY_IMAGE_ERROR_CODES.has(code) ||
    /image could not be loaded|file does not exist|valid image|load image failed|無法載入圖片/i.test(message)
  ) {
    return '無法讀取這張圖片，請重新選擇'
  }
  if (SAFE_QR_MESSAGES.has(message) || message.startsWith('圖片裡沒有找到 QR Code')) {
    return message
  }
  return '無法從圖庫辨識 QR Code，請再試一次'
}

export const restoredGalleryImportFromEvent = (event: unknown): RestoredGalleryImport | 'cancelled' | null => {
  if (!event || typeof event !== 'object') return null
  const restored = event as RestoredPluginResult
  if (restored.pluginId !== 'Camera' || restored.methodName !== 'chooseFromGallery') return null

  const requestId = `restored-gallery-${Date.now()}`
  if (restored.success !== true) {
    if (isGallerySelectionCancelled(restored.error)) return 'cancelled'
    return {
      kind: 'error',
      requestId,
      message: galleryImportErrorMessage(restored.error),
    }
  }

  const data = restored.data && typeof restored.data === 'object'
    ? restored.data as { results?: unknown }
    : null
  const results = Array.isArray(data?.results) ? data.results : []
  const firstResult = results[0] && typeof results[0] === 'object'
    ? results[0] as { uri?: unknown }
    : null
  const imageUri = typeof firstResult?.uri === 'string' ? firstResult.uri.trim() : ''

  if (!imageUri) {
    return {
      kind: 'error',
      requestId,
      message: '無法讀取這張圖片，請重新選擇',
    }
  }

  return { kind: 'image', requestId, imageUri }
}
