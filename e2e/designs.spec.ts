import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Snapshot } from '../shared/model'

test('list and islands toggle before theme, persist, and fit desktop and mobile', async ({ page }) => {
  const now = Date.now()
  const snapshot: Snapshot = {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
    projects: ['WeekTrace', 'NaturalGas', 'ThreadDeck', 'Website'].map((name, index) => ({ id: name, name, directory: `/${name}`, sessions: [
      { id: `${name}-work`, projectId: name, title: ['Native Windows support', 'Compare saved backtesting results', 'Shape the live session switchboard', 'Polish the checkout flow'][index], threadId: '1561737719133114458', guildId: '1526236793048141935', status: 'working', agentCount: 2, updatedAt: now - 10_000 },
      { id: `${name}-review`, projectId: name, title: 'Review the configuration and permissions before continuing with the next iteration', threadId: '1561737719133114459', guildId: '1526236793048141935', status: 'permission', agentCount: 0, updatedAt: now },
      { id: `${name}-reply`, projectId: name, title: 'Latest response waiting for you', threadId: '1561737719133114460', guildId: '1526236793048141935', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now },
    ] })),
  }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/snapshot', route => route.fulfill({ json: { ...snapshot, lastSuccessAt: Date.now() } }))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /Switch to (islands|list) view/ })
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to islands view')
  await expect(page.getByRole('combobox')).toHaveCount(0)
  expect(await toggle.evaluate(element => element.nextElementSibling?.getAttribute('aria-label'))).toBe('Switch to light mode')
  await mkdir('artifacts', { recursive: true })
  for (const design of ['classic', 'islands']) {
    await page.setViewportSize({ width: 1440, height: 1100 })
    if (design === 'islands') await toggle.click()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design)
    await expect(page.getByRole('link', { name: 'Native Windows support', exact: true })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `artifacts/design-${design}-desktop.png`, fullPage: true })
    await page.reload()
    await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design)
    await page.getByRole('searchbox').fill('backtesting')
    await expect(page.locator('.session-title')).toHaveCount(1)
    await page.getByRole('searchbox').fill('')
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      // Responsive controls move into a native popover on the media-query event.
      await expect(page.locator('#header-controls')).toHaveAttribute('popover', 'auto')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'App controls', exact: true }).click()
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design === 'classic' ? 'islands' : 'classic')
      await toggle.click()
      await expect(page.locator('.app-shell')).toHaveAttribute('data-design', design)
      await page.keyboard.press('Escape')
      if (width === 390) await page.screenshot({ path: `artifacts/design-${design}-mobile.png`, fullPage: true })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.screenshot({ path: 'artifacts/design-islands-light.png', fullPage: true })
  expect(errors).toEqual([])
})
