// Correct legacy shorthand backgrounds that were accidentally classified as foreground tokens.
import { readFileSync, writeFileSync } from 'node:fs'
const path = new URL('../src/App.css', import.meta.url)
const source = readFileSync(path, 'utf8')
const next = source.replace(/background(?:-color)?:\s*[^;{}]+;/g, (declaration) => declaration.replaceAll('var(--line-strong)', 'var(--surface-raised)').replaceAll('var(--ink)', 'var(--surface-raised)').replace(/rgba\((?:15, 23, 42, 0\.96|22, 26, 31, 0\.92|24, 25, 27, 0\.98)\)/g, 'var(--surface-raised)'))
writeFileSync(path, next)
