import { readFile, writeFile } from 'node:fs/promises'

const packageFile = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url)
const source = await readFile(packageFile, 'utf8')
const normalized = source.replaceAll('\\', '/')

if (normalized !== source) {
  await writeFile(packageFile, normalized, 'utf8')
}
