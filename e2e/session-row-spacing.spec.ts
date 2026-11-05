import { expect, test } from '@playwright/test'
import type { Snapshot } from '../shared/model'

for (const width of [320, 430, 1440]) for (const appearance of ['dark', 'light']) {
  test(`truncated titles leave breathing room before badges in ${appearance} at ${width}px`, async ({ page }) => {
    const now = Date.now(), projectId = '100000000000000010'
    const snapshot: Snapshot = {
      health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true,
      inventoryLimited: false, message: null,
      projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture', sessions: [
        { id: 'idle', threadId: '100000000000000001', guildId: null, projectId, title: 'A long session title that should truncate without crowding the idle pill and actions', status: 'idle', agentCount: 0, updatedAt: now },
        { id: 'working', threadId: '100000000000000002', guildId: null, projectId, title: 'Another long session title that should leave breathing room before the working pill', status: 'working', agentCount: 1, updatedAt: now },
        { id: 'permission', threadId: '100000000000000003', guildId: null, projectId, title: 'A permission request with a wider badge must still leave a readable truncated title', status: 'permission', agentCount: 0, updatedAt: now },
      ] }],
    }
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(appearance => {
      localStorage.setItem('threaddeck:appearance', JSON.stringify(appearance))
      Object.defineProperty(window, 'EventSource', { value: undefined })
    }, appearance)
    await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
    await page.route('**/api/chat/**', route => route.fulfill({ status: 503, json: { code: 'bridge_required', error: 'Static layout fixture' } }))
    await page.goto('/')
    await page.getByRole('button', { name: 'All sessions', exact: true }).click()
    await page.evaluate(() => document.fonts.ready)
    const rows = page.locator('.session-row')
    await expect(rows).toHaveCount(3)
    const geometry = () => rows.evaluateAll(nodes => nodes.map(node => {
      const title = node.querySelector<HTMLElement>('.session-title')!, copy = node.querySelector('.session-copy')!.getBoundingClientRect()
      const flags = node.querySelector('.session-flags')!.getBoundingClientRect(), actions = node.querySelector('.session-actions')!.getBoundingClientRect()
      const style = getComputedStyle(node)
      return { gap: flags.left - copy.right, actionGap: actions.left - flags.right, gridGap: parseFloat(style.columnGap), truncated: title.scrollWidth > title.clientWidth, titleWidth: title.clientWidth, overflow: getComputedStyle(title).textOverflow, height: node.getBoundingClientRect().height }
    }))
    const initial = await geometry()
    for (const row of initial) {
      const extraSpace = width <= 360 ? 4 : width <= 600 ? 12 : 64 - row.gridGap
      expect(row.gap).toBeGreaterThanOrEqual(width <= 360 ? 10 : 18)
      expect(row.gap).toBeCloseTo(row.gridGap + extraSpace, 0)
      if (width > 600) expect(row.gap).toBeCloseTo(64, 0)
      expect(row.actionGap).toBeCloseTo(row.gridGap, 0)
      expect(row.titleWidth).toBeGreaterThan(24)
      expect(row.truncated).toBe(true)
      expect(row.overflow).toBe('ellipsis')
      expect(row.height).toBe(42)
    }
    await rows.first().hover()
    expect(await geometry()).toEqual(initial)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 1440 && appearance === 'dark') await page.screenshot({ path: 'artifacts/session-title-spacing.png' })
    await page.getByRole('button', { name: 'App controls', exact: true }).click()
    await page.getByRole('button', { name: 'Switch to islands view' }).click()
    for (const copy of await page.locator('.session-tile > .session-copy').all()) {
      await expect(copy).toHaveCSS('margin-inline-end', '0px')
    }
  })
}
