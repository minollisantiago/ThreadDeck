import { test as base, expect } from '@playwright/test'

// Dashboard component regression checks run the actual standalone Dashboard.
// Production workspace and transport checks use Playwright directly.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/events', route => route.abort())
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/(?:\?.*)?$/, route => route.fulfill({ path: 'artifacts/dashboard-fixture/e2e/dashboard-fixture.html', contentType: 'text/html' }))
    await use(page)
  },
})
export { expect }
export type { Locator, Page } from '@playwright/test'
