import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const configuredPort = Number.parseInt(process.env.VITE_DEV_PORT || '5174', 10)
const sourceCommit = process.env.VITE_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'dev'

// https://vite.dev/config/
export default defineConfig({
  base: '/OpenPanel/',
  define: {
    'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(sourceCommit),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-dark.svg', 'favicon-light.svg', 'logo.png'],
      manifest: {
        name: 'OpenPanel Spectral Panel Builder',
        short_name: 'OpenPanel',
        description: 'Private, browser-native spectral flow cytometry panel design.',
        theme_color: '#17201d',
        background_color: '#e8e3d8',
        display: 'standalone',
        scope: '/OpenPanel/',
        start_url: '/OpenPanel/',
        icons: [
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,csv,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: Number.isFinite(configuredPort) ? configuredPort : 5174,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
})
