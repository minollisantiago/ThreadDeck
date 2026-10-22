import { expect, test } from './fixtures'

test('background picker changes canvas colors, persists, and works in mobile controls', async ({ page }) => {
  await page.route('**/api/snapshot', route => route.fulfill({ json: {
    health: 'connected', checkedAt: Date.now(), lastSuccessAt: Date.now(), attentionAvailable: true,
    inventoryLimited: false, message: null, projects: [],
  } }))
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/')
  for (const [name, color] of [['Porcelain', 'rgb(232, 235, 238)'], ['Warm paper', 'rgb(233, 227, 215)'], ['Cool slate', 'rgb(215, 225, 234)']]) {
    await page.getByRole('button', { name: `${name} theme`, exact: true }).click()
    await expect(page.locator('body')).toHaveCSS('background-color', color)
  }
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cool slate theme' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 16, 20)')
  await expect(page.getByRole('group', { name: 'Light theme background' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(215, 225, 234)')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'App controls' }).click()
  await page.getByRole('button', { name: 'Warm paper theme' }).click()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(233, 227, 215)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'App controls' }).click()
  await page.setViewportSize({ width: 1280, height: 920 })
  await page.screenshot({ path: 'artifacts/theme-picker-desktop.png' })
})
