import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vitest/config'

const versionPath = path.resolve(__dirname, '../VERSION')
const argusVersion = fs.existsSync(versionPath)
  ? fs.readFileSync(versionPath, 'utf8').trim()
  : '0.0.0-dev'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __ARGUS_VERSION__: JSON.stringify(argusVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/*.{test,spec}.{ts,tsx}'],
    unstubGlobals: true,
  },
  server: {
    allowedHosts: [
      'nonendemic-intermolar-exie.ngrok-free.dev',
      'gregarious-karlie-unmicrobial.ngrok-free.dev',
    ],
    proxy: {
      '/api/events/stream': {
        target: 'http://127.0.0.1:10804',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/api': {
        target: 'http://127.0.0.1:10804',
        changeOrigin: true,
        headers: { origin: 'http://127.0.0.1:10804' },
      },
    },
  },
})
