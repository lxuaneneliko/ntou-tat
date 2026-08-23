import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isPwaBuild = mode === 'pwa'

  return {
    base: isPwaBuild ? '/ntou-tat/' : '/',
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
                description: '海大行事曆、課表工具與校園快速連結',
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
