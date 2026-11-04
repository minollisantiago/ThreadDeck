import { expect, test } from './fixtures'
import type { Snapshot } from '../shared/model'

test('lifted light cards and state contrast survive every theme and accent without changing dark mode', async ({ page }) => {
  const now = Date.now()
  const snapshot: Snapshot = {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true,
    inventoryLimited: false, message: null,
    projects: [{ id: 'project', name: 'Contrast project', directory: '/project', sessions: [
      { id: 'idle', projectId: 'project', threadId: 'idle', guildId: null, title: 'Idle session', status: 'idle', agentCount: 0, updatedAt: now },
      { id: 'fresh', projectId: 'project', threadId: 'fresh', guildId: null, title: 'Finished session', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now },
    ] }],
  }
  await page.clock.setFixedTime(now)
  // This is a static CSS fixture, not an SSE reconnect test.
  await page.addInitScript(() => { Object.defineProperty(window, 'EventSource', { value: undefined }) })
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  // Apply the real workspace wrapper to the standalone dashboard fixture so its
  // flattening !important rule and selected-row rail participate in the cascade.
  await page.locator('.app-shell').evaluate(node => {
    node.parentElement!.classList.add('chat-manager')
    node.querySelector('.session-row')!.setAttribute('data-selected', 'true')
  })
  const card = page.locator('.project-panel').first()
  const idle = page.locator('.status-idle').first()
  const fresh = page.locator('.status-just-finished')
  const selected = page.locator('.session-row[data-selected=true]')
  const dark = await card.evaluate(node => getComputedStyle(node).backgroundColor)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  for (const [theme, surface] of [['Original', 'rgb(255, 255, 255)'], ['Porcelain', 'rgb(255, 255, 255)'], ['Warm paper', 'rgb(255, 253, 247)'], ['Cool slate', 'rgb(248, 251, 255)']]) {
    await page.getByRole('button', { name: `${theme} theme`, exact: true }).click()
    await expect(card).toHaveCSS('background-color', surface)
    await expect(page.locator('.project-heading').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(idle).not.toHaveCSS('box-shadow', 'none')
    await expect(page.locator('.project-total').first()).not.toHaveCSS('box-shadow', 'none')
    await expect(fresh).toHaveCSS('background-color', 'rgb(255, 240, 206)')
    await expect(fresh.locator('.finished-check')).toBeVisible()
    for (const accent of ['pink', 'lavender', 'blue', 'green', 'peach']) {
      await page.getByRole('button', { name: `${accent} accent`, exact: true }).click()
      const contrasts = await page.evaluate(() => {
        const rgb = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        const lum = (s: string) => rgb(s).map(v => { const x = v / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0)
        const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)
        const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
        const row = style('.session-row[data-selected=true]'), title = style('.session-row[data-selected=true] .session-title')
        const rail = getComputedStyle(document.querySelector('.session-row[data-selected=true] .session-copy')!, '::before')
        return {
          pills: ['.status-idle', '.project-total', '.status-just-finished'].map(s => { const c = style(s); return ratio(c.color, c.backgroundColor) }),
          selectedText: ratio(title.color, row.backgroundColor),
          rail: ratio(rail.backgroundColor, row.backgroundColor),
          cardRail: ratio(rail.backgroundColor, style('.project-panel').backgroundColor),
        }
      })
      for (const contrast of contrasts.pills) expect(contrast, `${theme} / ${accent} pill`).toBeGreaterThanOrEqual(4.5)
      expect(contrasts.selectedText).toBeGreaterThanOrEqual(4.5)
      expect(contrasts.rail).toBeGreaterThanOrEqual(3)
      expect(contrasts.cardRail).toBeGreaterThanOrEqual(3)
      const background = await selected.evaluate(node => getComputedStyle(node).backgroundColor)
      await selected.hover()
      await expect(selected).toHaveCSS('background-color', background)
      const other = page.locator('.session-row:not([data-selected=true])').first()
      await other.hover()
      expect(await other.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(background)
    }
  }
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(card).toHaveCSS('background-color', dark)
  await expect(fresh.locator('.finished-check')).toBeHidden()
  await expect(idle).toHaveCSS('box-shadow', 'none')
})
