import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // webServer is used for local dev only (CI starts server manually before running tests).
  webServer: {
    command:
      'cd backend && DB_PATH=/tmp/hooker-playwright-dev.db go run ./cmd/server',
    url: 'http://127.0.0.1:8765/healthz',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
