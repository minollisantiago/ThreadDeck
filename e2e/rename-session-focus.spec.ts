import { expect, test } from '@playwright/test'
import type { Snapshot } from '../shared/model'

for (const appearance of ['dark', 'light']) {
  test(`rename input uses a quiet inset without changing other keyboard focus in ${appearance}`, async ({ page }) => {
    const now = Date.now(), projectId = '100000000000000010'
    const snapshot: Snapshot = {
      health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true,
      inventoryLimited: false, message: null,
      projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture', sessions: [
        { id: 'rename', threadId: '100000000000000001', guildId: null, projectId, title: 'IOL Connection', status: 'idle', agentCount: 0, updatedAt: now },
      ] }],
    }
    await page.setViewportSize({ width: 430, height: 740 })
    await page.addInitScript(appearance => {
      localStorage.setItem('threaddeck:appearance', JSON.stringify(appearance))
      Object.defineProperty(window, 'EventSource', { value: undefined })
    }, appearance)
    await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
    await page.route('**/api/chat/**', route => route.fulfill({ status: 503, json: { code: 'bridge_required', error: 'Static focus fixture' } }))
    await page.goto('/')
    await page.getByRole('button', { name: 'All sessions', exact: true }).click()
    await page.getByRole('button', { name: 'ThreadDeck 1 session No working threads', exact: true }).click()
    await page.locator('.session-row').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    const input = page.getByRole('textbox', { name: 'Name', exact: true })
    await expect(input).toBeFocused()
    await expect(input).toHaveCSS('outline-style', 'none')
    await expect(input).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
    const style = await input.evaluate(node => {
      const style = getComputedStyle(node)
      return { shadow: style.boxShadow, fill: style.backgroundColor, surface: getComputedStyle(node.closest('dialog')!).backgroundColor }
    })
    expect(style.shadow).toContain('inset')
    expect(style.shadow).toContain('0px 0px 0px 1px')
    expect(style.fill).not.toBe(style.surface)
    await input.press('Tab')
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
    await expect(cancel).toBeFocused()
    await expect(cancel).toHaveCSS('outline-style', 'solid')
    await expect(input).toHaveCSS('box-shadow', 'none')
  })
}
