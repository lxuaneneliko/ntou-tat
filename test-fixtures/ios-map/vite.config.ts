import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve('test-fixtures/ios-map'),
  base: '/__qa__/',
  publicDir: false,
  plugins: [react()],
  build: { outDir: resolve('ios/App/App/public/__qa__'), emptyOutDir: true },
})
