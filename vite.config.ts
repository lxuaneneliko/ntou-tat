import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isPwaBuild = mode === 'pwa'
  const pwaBase = process.env.VITE_PWA_BASE_PATH || (process.env.VERCEL ? '/' : '/ntou-tat/')

  return {
    base: isPwaBuild ? pwaBase : '/',
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/onnxruntime-web/dist/*.wasm',
            dest: '',
          },
        ],
      }),
      ...(isPwaBuild
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['favicon-48.png', 'apple-touch-icon.png', 'ntou-emblem.png'],
              manifest: {
                name: '海大 TAT',
                short_name: '海大 TAT',
                description: '登入海大 AIS 並整理課表、成績、行事曆與校園資訊',
                lang: 'zh-Hant',
                start_url: './',
                scope: './',
                display: 'standalone',
                orientation: 'portrait-primary',
                background_color: '#0a0f19',
                theme_color: '#0a4f9e',
                icons: [
                  {
                    src: 'pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any',
                  },
                  {
                    src: 'pwa-maskable-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              workbox: {
                cleanupOutdatedCaches: true,
                globPatterns: ['**/*.{css,html,js,json,png,svg,webp}'],
                globIgnores: ['**/*.onnx', '**/*.wasm'],
                navigateFallback: 'index.html',
              },
            }),
          ]
        : []),
    ],
  }
})
