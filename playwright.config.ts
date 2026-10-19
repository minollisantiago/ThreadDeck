import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'artifacts/browser-results',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5188',
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  webServer: {
    command: 'npm start', url: 'http://127.0.0.1:5188',
    env: { PORT: '5188' }, reuseExistingServer: false,
  },
})
