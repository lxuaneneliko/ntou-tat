const AVATAR_SIZE = 320
const AVATAR_MAX_FILE_SIZE = 20 * 1024 * 1024

export const AVATAR_STORAGE_KEY = 'ntou-profile-avatar-v1'

export const readStoredAvatar = () => {
  try {
    return localStorage.getItem(AVATAR_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export const storeAvatar = (dataUrl: string) => {
  localStorage.setItem(AVATAR_STORAGE_KEY, dataUrl)
}

export const cropAvatarFile = async (file: File) => {
  if (file.size > AVATAR_MAX_FILE_SIZE) {
    throw new Error('照片檔案過大，請選擇 20 MB 以下的圖片')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
    const sourceX = (image.naturalWidth - sourceSize) / 2
    const sourceY = (image.naturalHeight - sourceSize) / 2
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE

    const context = canvas.getContext('2d')
    if (!context) throw new Error('此裝置無法處理這張照片')

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    )
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('無法讀取這張照片，請改選 JPG、PNG 或 WebP'))
    image.src = source
  })
