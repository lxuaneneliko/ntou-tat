// Mechanical migration of the legacy fixed CSS palette into the shared theme tokens.
import { readFileSync, writeFileSync } from 'node:fs'
const path = new URL('../src/App.css', import.meta.url)
const source = readFileSync(path, 'utf8')
const endRoot = source.indexOf('}') + 1
const css = source.slice(endRoot).replace(/#[\da-f]{3,8}\b/gi, (hex, offset, all) => {
  if (![4, 7].includes(hex.length)) return hex
  const full = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), brightness = (max + min) / 2, saturation = max - min
  const before = all.slice(Math.max(0, offset - 90), offset)
  const property = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'), before.lastIndexOf('}')) + 1).split(':')[0].trim()
  const background = /background|fill/.test(property)
  const border = /border|outline/.test(property)
  if (border) return 'var(--line)'
  if (saturation < .22) {
    if (background) return brightness < .065 ? 'var(--app-bg)' : brightness < .13 ? 'var(--surface)' : brightness < .22 ? 'var(--surface-raised)' : 'var(--surface-soft)'
    return brightness >= .65 ? 'var(--ink)' : brightness >= .28 ? 'var(--muted)' : 'var(--line-strong)'
  }
  // Pastel course cells keep their categorical colors and their dark text.
  if (brightness > .7 && background) return hex
  if (r > g * 1.3 && r > b * 1.15) return background ? 'var(--danger-soft)' : 'var(--danger)'
  if (r > b * 1.4 && g > b * 1.3) return 'var(--active)'
  if (g > r * 1.25 && g >= b) return 'var(--success)'
  if (b > r * 1.2 || (g > r * 1.15 && b > r * 1.15)) return background ? 'var(--brand)' : 'var(--accent)'
  return hex
})
writeFileSync(path, source.slice(0, endRoot) + css)
