import * as ort from 'onnxruntime-web'

let session: ort.InferenceSession | null = null

// Use the downloaded model from public directory
const MODEL_URL = '/common_old.onnx'

// Load charset
let CHARSET: string | string[] | null = null

async function loadCharset(): Promise<string | string[]> {
  if (CHARSET) return CHARSET
  try {
    const res = await fetch('/common_old_charset.json')
    const json = await res.json()
    if (Array.isArray(json)) {
      CHARSET = json
    } else if (typeof json === 'string') {
      CHARSET = json
    } else if (json.charset) {
       CHARSET = json.charset
    }
  } catch (e) {
    console.error('Failed to load charset', e)
    throw new Error('Failed to load charset')
  }
  if (!CHARSET) {
    throw new Error('Failed to load charset: empty')
  }
  return CHARSET
}
let modelLoadPromise: Promise<void> | null = null

export async function loadOcrModel() {
  if (session) return
  if (modelLoadPromise) return await modelLoadPromise

  modelLoadPromise = (async () => {
    try {
      ort.env.wasm.numThreads = 1
      session = await ort.InferenceSession.create(MODEL_URL)
    } catch (e) {
      console.error('Failed to load OCR model:', e)
      throw e
    } finally {
      modelLoadPromise = null
    }
  })()

  return await modelLoadPromise
}

/**
 * Preprocesses an image for the OCR model.
 * @param imageElement The image element.
 * @returns The preprocessed tensor.
 */
function preprocessImage(imageElement: HTMLImageElement): ort.Tensor {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2d context')

  const targetHeight = 64
  const originalWidth = imageElement.naturalWidth || imageElement.width
  const originalHeight = imageElement.naturalHeight || imageElement.height
  const targetWidth = Math.floor(originalWidth * (targetHeight / originalHeight))

  canvas.width = targetWidth
  canvas.height = targetHeight

  ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight)

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  const data = imageData.data
  const inputData = new Float32Array(targetWidth * targetHeight)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const grayscale = 0.299 * r + 0.587 * g + 0.114 * b
    // Model specific normalization 
    inputData[i / 4] = grayscale / 255.0
  }

  // Model expects shape [1, 1, 64, targetWidth]
  return new ort.Tensor('float32', inputData, [1, 1, targetHeight, targetWidth])
}

function decodeOutput(outputTensor: ort.Tensor, charset: string | string[]): string {
  const outputData = outputTensor.data as Float32Array
  const decodedIndices = []
  let lastIndex = -1
  
  const sequenceLength = outputTensor.dims[0]
  const numClasses = outputTensor.dims[2]

  for (let i = 0; i < sequenceLength; i++) {
    let maxProb = -Infinity
    let maxIndex = -1
    for (let j = 0; j < numClasses; j++) {
      const prob = outputData[i * numClasses + j]
      if (prob > maxProb) {
        maxProb = prob
        maxIndex = j
      }
    }

    if (maxIndex !== lastIndex && maxIndex !== 0) {
      decodedIndices.push(maxIndex)
    }
    lastIndex = maxIndex
  }

  let resultText = ''
  for (const index of decodedIndices) {
    resultText += charset[index]
  }

  return resultText
}

export async function recognizeCaptcha(dataUrl: string): Promise<string> {
  if (!session) {
    await loadOcrModel()
    if (!session) {
      throw new Error('OCR model is not loaded.')
    }
  }

  const charset = await loadCharset()

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        const inputTensor = preprocessImage(img)
        const feeds = { 'input1': inputTensor }
        const results = await session!.run(feeds)
        const outputTensor = Object.values(results)[0] as ort.Tensor
        const recognizedText = decodeOutput(outputTensor, charset)
        resolve(recognizedText.toUpperCase())
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
