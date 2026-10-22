import { expect, test } from '@playwright/test'
import type { Session, Snapshot } from '../shared/model'

for (const design of ['classic', 'islands']) for (const width of [390, 1280]) {
  test(`project unread pill marks only that project read without toggling it in ${design} at ${width}px`, async ({ page }) => {
    const now = Date.now()
    const reply = (projectId: string, id: string): Session => ({ id, projectId, title: id, guildId: null, threadId: id, status: 'idle', agentCount: 0, updatedAt: now, responseAt: now })
    const snapshot: Snapshot = {
      health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
      projects: [
        { id: 'alpha', name: 'Alpha', directory: '/alpha', sessions: [
          { ...reply('alpha', 'Working'), status: 'working', agentCount: 1, responseAt: null }, reply('alpha', 'First reply'), reply('alpha', 'Second reply'),
        ] },
        { id: 'beta', name: 'Beta', directory: '/beta', sessions: [reply('beta', 'Other project reply')] },
      ],
    }
    await page.addInitScript(value => localStorage.setItem('threaddeck:design', JSON.stringify(value)), design)
    await page.route('**/api/snapshot', route => route.fulfill({ json: { ...snapshot, lastSuccessAt: Date.now() } }))
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('button button')).toHaveCount(0)
    const heading = page.getByRole('button', { name: /Alpha/ })
    const unread = page.getByRole('button', { name: 'Mark all threads as read', description: /Alpha/ })
    await expect(unread).toHaveText('2 unread')
    await heading.click()
    await expect(heading).toHaveAttribute('aria-expanded', 'false')
    await unread.focus()
    await page.keyboard.press('Enter')
    await expect(heading).toHaveAttribute('aria-expanded', 'false')
    await expect(unread).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark all threads as read', description: /Beta/ })).toHaveText('1 unread')
    await page.reload()
    await expect(unread).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mark all threads as read', description: /Beta/ })).toHaveText('1 unread')
  })
}
