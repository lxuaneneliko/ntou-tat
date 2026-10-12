// Mechanical theme-token replacement; intentionally leaves QR and course-category palettes unchanged.
import { readFileSync, writeFileSync } from 'node:fs'
const path = new URL('../src/App.tsx', import.meta.url)
const source = readFileSync(path, 'utf8')
writeFileSync(path, source.replaceAll("background: '#252a30'", "background: 'var(--surface)' ").replaceAll("color: '#fff'", "color: 'var(--ink)'").replaceAll(', #252a30 0)', ', var(--surface) 0)'))
