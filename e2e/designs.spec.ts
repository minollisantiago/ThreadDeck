import { expect, test } from './fixtures'
import type { Snapshot } from '../shared/model'

test('the current view is fixed and ignores saved Islands preferences on desktop and mobile', async ({ page }) => {
  const now = Date.now()
  const snapshot: Snapshot = {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
    projects: ['ThreadDeck', 'NaturalGas'].map(name => ({ id: name, name, directory: `/${name}`, sessions: [
      { id: `${name}-work`, projectId: name, title: `${name} working thread`, threadId: '1561737719133114458', guildId: '1526236793048141935', status: 'working', agentCount: 2, updatedAt: now },
      { id: `${name}-review`, projectId: name, title: `${name} review`, threadId: '1561737719133114459', guildId: '1526236793048141935', status: 'permission', agentCount: 0, updatedAt: now },
    ] })),
  }
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.addInitScript(() => localStorage.setItem('threaddeck:design', '"islands"'))
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 })
    await page.goto('/')
    await expect(page.locator('.app-shell')).toHaveAttribute('data-design', 'classic')
    await expect(page.locator('.session-row')).toHaveCount(4)
    await expect(page.locator('.projects-islands, .session-tile')).toHaveCount(0)
    await page.getByRole('searchbox').fill('NaturalGas working')
    await expect(page.locator('.session-title')).toHaveCount(1)
    await page.getByRole('searchbox').fill('')
    await page.getByRole('button', { name: 'App controls', exact: true }).click()
    const popup = page.getByRole('dialog', { name: 'Interface & notifications', exact: true })
    await expect(popup).toBeVisible()
    await expect(popup.getByRole('group', { name: 'Accent color', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Switch to (islands|list) view/, includeHidden: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'App controls', exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
