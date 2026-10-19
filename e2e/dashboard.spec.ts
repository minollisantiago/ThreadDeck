import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Snapshot, Session } from '../shared/model'

test('desktop, theme, search, collapse, stale state and mobile layout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const now = Date.now()
  function session(id: string, title: string, status: Session['status'], age: number): Session {
    return { id, title, status, projectId: 'a', guildId: '1526236793048141935', threadId: '1561737719133114458', agentCount: status === 'working' ? 1 : 0, updatedAt: now - age }
  }
  let snapshot: Snapshot = {
    health: 'connected', lastSuccessAt: now, checkedAt: now, attentionAvailable: true, inventoryLimited: true, message: null,
    projects: [
      { id: 'a', name: 'WeekTrace', directory: '/projects/weektrace', sessions: [session('a1', 'Native Windows support', 'working', 25_000), session('a2', 'Improve report navigation', 'working', 120_000), session('a3', 'Weekly activity report', 'idle', 540_000)] },
      { id: 'b', name: 'naturalgas', directory: '/projects/naturalgas', sessions: [session('b1', 'Compare saved backtesting results', 'working', 50_000), session('b2', 'Review the strategy configuration', 'permission', 180_000)] },
      { id: 'c', name: 'ThreadDeck', directory: '/projects/threaddeck', sessions: [session('c1', 'Shape the live session switchboard', 'working', 5_000)] },
      { id: 'd', name: 'Website', directory: '/projects/website', sessions: [session('d1', 'Polish the checkout flow', 'idle', 720_000)] },
      { id: 'e', name: 'SDK', directory: '/projects/sdk', sessions: [session('e1', 'Pagination tests', 'idle', 1_800_000)] },
    ],
  }
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.setViewportSize({ width: 1440, height: 1060 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Native Windows support', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Native Windows support', exact: true })).toHaveAttribute('href', /^discord:\/\/-\/channels\//)
  await expect(page.getByRole('button', { name: /Website/ })).toHaveAttribute('aria-expanded', 'false')
  await page.evaluate(() => document.fonts.ready)
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/threaddeck-desktop.png', fullPage: true })

  await page.getByRole('button', { name: /WeekTrace/ }).click()
  await page.waitForResponse('**/api/snapshot')
  await expect(page.getByRole('button', { name: /WeekTrace/ })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Working', exact: true }).click()
  await expect(page.getByRole('button', { name: /Website/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /naturalgas/ })).toBeVisible()
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  await page.getByRole('button', { name: /WeekTrace/ }).click()
  await page.getByRole('searchbox').fill('strategy')
  await expect(page.getByRole('button', { name: /WeekTrace/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Review the strategy configuration', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).click()

  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light')
  await page.screenshot({ path: 'artifacts/threaddeck-light.png', fullPage: true })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/threaddeck-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  snapshot = { ...snapshot, health: 'stale' }
  await page.waitForResponse('**/api/snapshot')
  await expect(page.getByRole('alert')).toContainText('Live status unavailable')
  await expect(page.getByText('Unknown', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'artifacts/threaddeck-stale.png', fullPage: true })
  expect(errors).toEqual([])
})
