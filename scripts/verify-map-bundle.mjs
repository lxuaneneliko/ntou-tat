import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

// Run against both dist and android/app/src/main/assets/public before packaging.
const directory = resolve(process.argv[2] || 'dist', 'assets')
const files = await readdir(directory)
const workers = files.filter((file) => /^maplibre-gl-worker-.*\.js$/.test(file))
if (workers.length !== 1) throw new Error(`Expected one bundled map worker, found ${workers.length}`)
const worker = workers[0]
const code = await readFile(resolve(directory, worker), 'utf8')
if ((await stat(resolve(directory, worker))).size < 100_000 || code.includes('maplibre-gl-shared.mjs')) {
  throw new Error('Map worker is not self-contained: use ?worker&url, not ?url')
}
const chunks = files.filter((file) => /^NtouMapTabScreen-.*\.js$/.test(file))
if (!chunks.length || !(await Promise.all(chunks.map(async (file) =>
  (await readFile(resolve(directory, file), 'utf8')).includes(worker),
))).some(Boolean)) throw new Error('Map screen does not reference its bundled worker')
console.log(`Map bundle OK: ${worker} (${(await stat(resolve(directory, worker))).size} bytes)`)
