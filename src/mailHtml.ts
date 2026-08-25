import DOMPurify from 'dompurify'

const ALLOWED_LINK_PROTOCOLS = /^(https?:|mailto:|tel:)/i
const REMOTE_IMAGE_PROTOCOLS = /^https?:/i

export type SafeMailHtml = { srcDoc: string; hasRemoteImages: boolean }

const normalizeCid = (value: string) => value.replace(/^cid:/i, '').replace(/^<|>$/g, '').trim().toLowerCase()

export function safeMailHtml(html: string, inlineImages: Record<string, string>, allowRemoteImages: boolean): SafeMailHtml {
  const sanitized = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'base', 'link', 'video', 'audio'],
    FORBID_ATTR: ['srcdoc'],
  })
  const document = new DOMParser().parseFromString(sanitized, 'text/html')
  const cidImages = new Map(Object.entries(inlineImages).map(([key, value]) => [normalizeCid(key), value]))
  let hasRemoteImages = false

  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name)
    }
    const style = element.getAttribute('style')
    if (style && /url\s*\(|expression\s*\(|@import/i.test(style)) element.removeAttribute('style')
  })

  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (!ALLOWED_LINK_PROTOCOLS.test(href)) {
      anchor.removeAttribute('href')
      return
    }
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
  })

  document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    const source = image.getAttribute('src')?.trim() ?? ''
    if (/^cid:/i.test(source)) {
      const inline = cidImages.get(normalizeCid(source))
      if (inline) image.src = inline
      else image.removeAttribute('src')
      return
    }
    if (/^data:image\//i.test(source)) return
    if (REMOTE_IMAGE_PROTOCOLS.test(source)) {
      hasRemoteImages = true
      if (!allowRemoteImages) image.removeAttribute('src')
      return
    }
    image.removeAttribute('src')
  })

  document.querySelectorAll('style').forEach((style) => {
    style.textContent = (style.textContent ?? '').replace(/@import[^;]+;?/gi, '').replace(/url\s*\([^)]*\)/gi, 'none')
  })

  const baseStyle = `
    :root { color-scheme: light; }
    html, body { margin: 0; padding: 0; background: #fff; color: #17202a; }
    body { padding: 16px; overflow-wrap: anywhere; font: 14px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    img { max-width: 100% !important; height: auto !important; }
    table { max-width: 100% !important; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    a { color: #0969a8; }
  `
  return {
    hasRemoteImages,
    srcDoc: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseStyle}</style></head><body>${document.body.innerHTML}</body></html>`,
  }
}
