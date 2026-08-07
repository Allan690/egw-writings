import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const root = path.dirname(fileURLToPath(import.meta.url))
const emptyShim = path.resolve(root, 'src/shims/empty.ts')

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  define: {
    'process.versions.node': 'undefined',
  },
  resolve: {
    alias: {
      fs: emptyShim,
      path: emptyShim,
      crypto: emptyShim,
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'corpus/manifest.json'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,wasm,json}'],
        runtimeCaching: [
          {
            urlPattern: /\/corpus\/egw\.sqlite(\.gz)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'egw-corpus',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'EGW Writings',
        short_name: 'EGW',
        description:
          'Local-first Ellen G. White writings with instant FTS5 search',
        theme_color: '#78350f',
        background_color: '#faf8f4',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
