import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 120_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    retries: 0,
    use: {
        /* Dev Vite often binds ::1:5174 when 5173 is taken — override with EMS_E2E_BASE_URL. */
        baseURL: process.env.EMS_E2E_BASE_URL || 'http://localhost:5174',
        headless: true,
        viewport: { width: 1400, height: 900 },
        trace: 'on-first-retry',
    },
    webServer: process.env.EMS_E2E_SKIP_WEBSERVER
        ? undefined
        : {
              command: 'npm run dev -- --host localhost --port 5174',
              url: 'http://localhost:5174',
              reuseExistingServer: true,
              timeout: 120_000,
          },
});
