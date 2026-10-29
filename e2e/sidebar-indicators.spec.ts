import { test, expect } from '@playwright/test'

for (const theme of ['dark', 'light']) for (const design of ['classic', 'islands']) test(`unread thread badge matches its project counter in ${theme} ${design}`, async ({ page }) => {
  await page.addInitScript(({ theme, design }) => {
    localStorage.setItem('threaddeck:appearance', JSON.stringify(theme))
    localStorage.setItem('threaddeck:design', JSON.stringify(design))
  }, { theme, design })
  await page.route('**/api/snapshot', route => {
    const now = Date.now(), projectId = '100000000000000010'
    return route.fulfill({ json: { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null, projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture', sessions: [
      { id: 'unread', threadId: '100000000000000001', guildId: null, projectId, title: 'Unread response', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now },
      { id: 'idle', threadId: '100000000000000002', guildId: null, projectId, title: 'Read idle response', status: 'idle', agentCount: 0, updatedAt: now },
    ] }] } })
  })
  await page.route('**/api/events', route => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  const badge = page.locator('.session-row[data-session-id="unread"] .status-unread')
  const counter = page.locator('.project-unread-action')
  const idle = page.locator('.session-row[data-session-id="idle"] .status-idle')
  await expect(badge).toBeVisible()
  await expect(counter).toBeVisible()
  await expect(idle).toBeVisible()
  const colors = async (selector: typeof badge) => selector.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color }))
  const unreadColors = await colors(badge)
  expect(unreadColors).toEqual(await colors(counter))
  expect(unreadColors).not.toEqual(await colors(idle))
  await expect(badge).toHaveCSS('font-weight', '600')
})
