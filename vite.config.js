import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** Must match `PORT` in server/.env (Express). Default 5002. */
  const apiPort = String(env.VITE_API_PORT || env.VITE_DEV_API_PORT || '5002').trim() || '5002'
  const apiTarget = `http://127.0.0.1:${apiPort}`

  return {
    plugins: [react()],
    optimizeDeps: {
      include: ['exceljs']
    },
    resolve: {
      alias: {
        // Prefer browser build so Vite/client does not pull Node fs/stream polyfills.
        exceljs: 'exceljs/dist/exceljs.min.js'
      }
    },
    server: {
      /** Stable URL for bookmarks; if busy Vite tries the next port (strictPort: false). */
      port: 5174,
      strictPort: false,
      watch: {
        /** Puppeteer PDF temp HTML must not trigger full-page reload loops during dev. */
        ignored: ['**/server/temp/**', '**/.cache/puppeteer/**'],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          /** Quote PDF (Puppeteer) can run longer than the default proxy timeout */
          timeout: 600000,
          proxyTimeout: 600000,
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
