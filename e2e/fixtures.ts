import { test as base, expect } from '@playwright/test'

// Existing visual checks supply synthetic HTTP snapshots and exercise fallback.
// Live transport checks use Playwright directly instead of this fixture.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/events', route => route.abort())
    await use(page)
  },
})
export { expect }
export type { Locator, Page } from '@playwright/test'
