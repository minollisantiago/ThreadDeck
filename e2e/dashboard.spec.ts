import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Snapshot, Session } from '../shared/model'

test('mark all as read includes filtered-out threads and survives reload', async ({ page }) => {
  const now = Date.now()
  const snapshot: Snapshot = { health: 'connected', lastSuccessAt: now, checkedAt: now,
    attentionAvailable: true, inventoryLimited: false, message: null,
    projects: ['Alpha', 'Beta'].map(name => ({ id: name, name, directory: `/${name}`, sessions: [
      { id: name, projectId: name, title: `${name} reply`, threadId: name, guildId: null,
        status: 'idle', agentCount: 0, updatedAt: now, responseAt: now - 1 },
    ] })) }
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.goto('/')
  await expect(page.locator('.session-unread')).toHaveCount(2)
  await page.getByRole('searchbox').fill('Alpha')
  await expect(page.locator('.session-unread')).toHaveCount(1)
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click()
  await page.getByRole('searchbox').fill('')
  await expect(page.locator('.session-unread')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark all as read', exact: true })).toBeDisabled()
  await page.reload()
  await expect(page.getByText('No active sessions', { exact: true })).toBeVisible()
})

test('unread replies remain visible until acknowledged and new replies become unread again', async ({ page, context }) => {
  const now = Date.now()
  const session: Session = { id: 'reply', title: 'A response waiting for you', projectId: 'a',
    guildId: '1526236793048141935', threadId: '1561737719133114458', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now - 1000 }
  let snapshot: Snapshot = { health: 'connected', lastSuccessAt: now, checkedAt: now,
    attentionAvailable: true, inventoryLimited: false, message: null,
    projects: [{ id: 'a', name: 'Replies', directory: '/replies', sessions: [session] }] }
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await context.route('https://discord.com/**', route => route.fulfill({ body: 'Discord thread' }))
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Replies/ })).toContainText('1 unread')
  await expect(page.locator('.session-unread .session-title')).toBeVisible()
  await page.getByRole('button', { name: 'Attention', exact: true }).click()
  await expect(page.locator('.session-unread')).toHaveCount(1)
  await page.getByRole('button', { name: 'Mark A response waiting for you as read' }).click()
  await expect(page.locator('.session-unread')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('No active sessions', { exact: true })).toBeVisible()
  snapshot = { ...snapshot, projects: [{ ...snapshot.projects[0], sessions: [{ ...session, responseAt: now + 1, updatedAt: now + 1 }] }] }
  await expect(page.locator('.session-unread')).toHaveCount(1, { timeout: 10_000 })
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'Open A response waiting for you in browser' }).click()
  const popup = await popupPromise
  await popup.close()
  await expect(page.locator('.session-unread')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('No active sessions', { exact: true })).toBeVisible()
})

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
  const favicon = page.locator('link[rel="icon"]')
  await expect(favicon).toHaveAttribute('type', 'image/svg+xml')
  const faviconUrl = await favicon.evaluate((element: HTMLLinkElement) => element.href)
  const icon = await page.request.get(faviconUrl)
  expect(icon.ok()).toBe(true)
  expect(icon.headers()['content-type']).toContain('image/svg+xml')
  expect(await icon.text()).toContain('stroke="#f77c9d"')
  await expect(page.getByRole('link', { name: 'Native Windows support', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Native Windows support', exact: true })).toHaveAttribute('href', /^discord:\/\/-\/channels\//)
  await expect(page.getByRole('button', { name: 'Active sessions', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /Website/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Weekly activity report', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  await expect(page.getByRole('button', { name: /Website/ })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: /WeekTrace/ })).toContainText('3 sessions')
  await expect(page.getByRole('button', { name: /naturalgas/ })).toContainText('1 needs attention')
  await expect(page.locator('.session-attention .session-title')).toHaveText('Review the strategy configuration')
  await page.keyboard.press('/')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await expect(page.getByRole('searchbox')).toHaveCSS('outline-style', 'none')
  await expect(page.getByRole('searchbox')).toHaveCSS('box-shadow', /inset/)
  await page.keyboard.type('strategy')
  await expect(page.getByRole('searchbox')).toHaveValue('strategy')
  await expect(page.getByRole('button', { name: /WeekTrace/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('searchbox')).toHaveValue('')
  const connection = page.getByRole('button', { name: 'Connected', exact: true })
  await expect(page.getByRole('tooltip')).not.toBeVisible()
  await connection.hover()
  await expect(page.getByRole('tooltip')).toContainText('Last successful update:')
  await expect(page.getByRole('tooltip')).toContainText('Recent session inventory is limited.')
  await expect(page.locator('.connection-dot')).toHaveCSS('width', '9px')
  await expect(page.locator('.session-title').first()).toHaveCSS('font-size', '14px')
  await expect(page.locator('h1')).toHaveCSS('font-size', '29px')
  await page.getByRole('heading', { name: /ThreadDeck/ }).hover()
  await expect(page.getByRole('tooltip')).not.toBeVisible()
  await connection.focus()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await connection.blur()
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
  await page.setViewportSize({ width: 320, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.locator('.project-attention')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })

  snapshot = { ...snapshot, health: 'stale' }
  await page.waitForResponse('**/api/snapshot')
  await expect(page.getByRole('alert')).toContainText('Live status unavailable')
  await expect(page.getByText('Unknown', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.session-attention')).toHaveCount(0)
  await expect(page.locator('.project-attention')).toHaveCount(0)
  await page.screenshot({ path: 'artifacts/threaddeck-stale.png', fullPage: true })
  expect(errors).toEqual([])
})
