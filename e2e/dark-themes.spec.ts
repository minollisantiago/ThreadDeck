import { expect, test } from '@playwright/test'

test('dark background variants persist and the mobile popup stays in place across modes', async ({ page }) => {
  const now = Date.now()
  await page.route('**/api/snapshot', route => route.fulfill({ json: {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true,
    inventoryLimited: false, message: null,
    projects: [{ id: 'demo', name: 'ThreadDeck', directory: '/demo', sessions: [
      { id: 'demo-thread', projectId: 'demo', title: 'Review dashboard theme variants', guildId: '1526236793048141935', threadId: '1562126778531582112', status: 'working', agentCount: 1, updatedAt: now },
    ] }],
  } }))
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 430, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: 'App controls' }).click()
  const popup = page.getByRole('group', { name: 'Appearance and links' })
  const darkPicker = page.getByRole('group', { name: 'Dark theme background' })
  await expect(darkPicker.getByRole('button')).toHaveCount(4)
  const initialBounds = await popup.boundingBox()
  const toggleBounds = await page.getByRole('button', { name: 'Switch to light mode' }).boundingBox()
  for (const [label, color] of [
    ['Charcoal', 'rgb(19, 17, 20)'], ['Midnight', 'rgb(11, 16, 27)'], ['Graphite', 'rgb(25, 25, 30)'],
  ]) {
    await darkPicker.getByRole('button', { name: `${label} theme`, exact: true }).click()
    await expect(page.locator('body')).toHaveCSS('background-color', color)
    await page.screenshot({ path: `artifacts/dark-theme-${label.toLowerCase()}.png` })
    expect(await popup.boundingBox()).toEqual(initialBounds)
  }
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.getByRole('group', { name: 'Light theme background' }).getByRole('button')).toHaveCount(4)
  expect(await popup.boundingBox()).toEqual(initialBounds)
  expect(await page.getByRole('button', { name: 'Switch to dark mode' }).boundingBox()).toEqual(toggleBounds)
  await page.getByRole('button', { name: 'Warm paper theme', exact: true }).click()
  await page.screenshot({ path: 'artifacts/theme-popup-light-stable.png' })
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 30)')
  expect(await popup.boundingBox()).toEqual(initialBounds)
  await page.screenshot({ path: 'artifacts/theme-popup-dark-stable.png' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-dark-theme', 'graphite')
  await page.getByRole('button', { name: 'App controls' }).click()
  await expect(page.getByRole('button', { name: 'Graphite theme' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(233, 227, 215)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
