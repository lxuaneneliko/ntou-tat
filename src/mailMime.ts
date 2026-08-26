const MIME_WORD = /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi

const decodeBytes = (bytes: number[], charset: string) =>
  new TextDecoder(charset.trim().toLowerCase()).decode(Uint8Array.from(bytes))

const decodeBase64Word = (value: string, charset: string) =>
  decodeBytes([...atob(value)].map((character) => character.charCodeAt(0)), charset)

const decodeQuotedWord = (value: string, charset: string) => {
  const normalized = value.replace(/_/g, ' ')
  const bytes: number[] = []
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === '=' && /^[0-9a-f]{2}$/i.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(normalized.charCodeAt(index))
    }
  }
  return decodeBytes(bytes, charset)
}

export const decodeMailHeader = (value: string) =>
  value
    .replace(MIME_WORD, (word, charset: string, encoding: string, content: string) => {
      try {
        return encoding.toLowerCase() === 'b'
          ? decodeBase64Word(content, charset)
          : decodeQuotedWord(content, charset)
      } catch {
        return word
      }
    })
    .replace(/\uFFFD/g, '')
    .replace(/×(?=\S)/g, '× ')
    .replace(/\s{2,}/g, ' ')
    .trim()
