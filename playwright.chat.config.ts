import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: ['chat-workspace.spec.ts', 'attachment-rows.spec.ts'], outputDir: 'artifacts/chat-browser-results', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5190', browserName: 'chromium', viewport: { width: 1440, height: 1050 } },
  webServer: { command: 'node scripts/serve-chat-tests.mjs', url: 'http://127.0.0.1:5190', reuseExistingServer: false },
})
