import { expect, test } from '@playwright/test'
import type { Snapshot } from '../shared/model'

for (const appearance of ['dark', 'light']) for (const design of ['classic', 'islands']) {
  test(`thread hover highlights only the title in ${appearance} ${design} view`, async ({ page }) => {
    const now = Date.now(), projectId = '100000000000000010'
    const snapshot: Snapshot = {
      health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true,
      inventoryLimited: false, message: null,
      projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture', sessions: [
        { id: 'idle', threadId: '100000000000000001', guildId: null, projectId, title: 'A thread for later', status: 'idle', agentCount: 0, updatedAt: now },
      ] }],
    }
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.addInitScript(({ appearance, design }) => {
      localStorage.setItem('threaddeck:appearance', JSON.stringify(appearance))
      localStorage.setItem('threaddeck:design', JSON.stringify(design))
      Object.defineProperty(window, 'EventSource', { value: undefined })
    }, { appearance, design })
    await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
    await page.route('**/api/chat/**', route => route.fulfill({ status: 503, json: { code: 'bridge_required', error: 'Static layout fixture' } }))
    await page.goto('/')
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
    await page.getByRole('button', { name: 'All sessions', exact: true }).click()
    const row = page.locator('.session-row'), title = row.locator('.session-title')
    if (!await row.isVisible()) await page.locator('.project-heading').click()
    await expect(row).toBeVisible()
    await page.mouse.move(0, 0)
    const background = await row.evaluate(node => getComputedStyle(node).backgroundColor)
    const color = await title.evaluate(node => getComputedStyle(node).color)
    // Hover the row padding rather than the title itself.
    await row.hover({ position: { x: 2, y: 2 } })
    await expect(row).toHaveCSS('background-color', background)
    await expect(title).not.toHaveCSS('color', color)
    await page.mouse.move(0, 0)
    await title.focus()
    await expect(row).toHaveCSS('background-color', background)
    await title.click()
    await expect(row).toHaveAttribute('data-selected', 'true')
    await expect(row).not.toHaveCSS('background-color', background)
    const selectedBackground = await row.evaluate(node => getComputedStyle(node).backgroundColor)
    await page.mouse.move(0, 0)
    await expect(row).toHaveCSS('background-color', selectedBackground)
    await row.hover({ position: { x: 2, y: 2 } })
    await expect(row).toHaveCSS('background-color', selectedBackground)
  })
}
