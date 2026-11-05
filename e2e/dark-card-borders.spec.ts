import { expect, test } from '@playwright/test'
import type { Snapshot } from '../shared/model'

for (const [theme, canvas, row, rule] of [
  ['original', 'rgb(16, 16, 20)', 'rgb(36, 35, 43)', 'rgba(255, 255, 255, 0.15)'],
  ['charcoal', 'rgb(19, 17, 20)', 'rgb(42, 36, 46)', 'rgba(255, 255, 255, 0.098)'],
  ['midnight', 'rgb(11, 16, 27)', 'rgb(28, 42, 61)', 'rgba(145, 172, 210, 0.14)'],
  ['graphite', 'rgb(25, 25, 30)', 'rgb(45, 45, 54)', 'rgba(255, 255, 255, 0.157)'],
]) test(`borderless ${theme} groups retain existing backgrounds and shared control borders`, async ({ page }) => {
  const now = Date.now(), projectId = '100000000000000010', threadId = '100000000000000001'
  const snapshot: Snapshot = {
    health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true,
    inventoryLimited: false, message: null,
    projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture/threaddeck', sessions: [
      { id: 'idle', threadId, guildId: null, projectId, title: 'Borderless dark theme review', status: 'idle', agentCount: 0, updatedAt: now },
      { id: 'working', threadId: '100000000000000002', guildId: null, projectId, title: 'Working on another task', status: 'working', agentCount: 1, updatedAt: now },
    ] }],
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.addInitScript(theme => {
    Object.defineProperty(window, 'EventSource', { value: undefined })
    localStorage.setItem('threaddeck:appearance', JSON.stringify('dark'))
    localStorage.setItem('threaddeck:dark-theme', JSON.stringify(theme))
  }, theme)
  await page.route('**/api/snapshot', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/chat/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/info')) return route.fulfill({ json: { protocol: 1, kimakiVersion: '1.4.0', actor: 'local-operator', capabilities: ['history', 'changes', 'prompt', 'queue', 'catalog'] } })
    if (url.pathname.endsWith('/changes')) return
    if (url.pathname.endsWith('/catalog')) return route.fulfill({ json: { entries: [] } })
    if (url.pathname.endsWith('/messages')) return route.fulfill({ json: { cursor: 'contrast:0', before: null, stale: false, messages: [
      { id: '100000000000000005', channel_id: threadId, author: { id: 'bot', username: 'Kimaki', bot: true }, timestamp: new Date(now).toISOString(), content: '## Borderless project groups\n\nExisting dark backgrounds, with clearer outlines on the Original theme.\n\n```ts\nconst backgrounds = "unchanged"\n```', attachments: [], components: [], embeds: [] },
    ] } })
    return route.fulfill({ status: 404, json: { error: 'Unexpected fixture endpoint' } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'All sessions', exact: true }).click()
  await page.getByRole('button', { name: 'Borderless dark theme review', exact: true }).click()
  await expect(page.locator('.chat-code')).toBeVisible()
  const project = page.locator('.project-panel').first()
  await expect(project).toHaveCSS('border-top-width', '0px')
  await expect(project).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('body')).toHaveCSS('background-color', canvas)
  await expect(page.locator('.chat-workspace')).toHaveCSS('background-color', canvas)
  await expect(page.locator('.session-row[data-selected=true]')).toHaveCSS('background-color', row)
  await expect(page.locator('.status-idle')).toHaveCSS('background-color', row)
  await page.getByRole('heading', { name: 'Borderless project groups' }).click()
  // All structural outlines consume the same rule, while project groups remain borderless.
  for (const [selector, property] of [
    ['.chat-manager', 'border-right-color'], ['.chat-pane-header', 'border-bottom-color'],
    ['.chat-composer-box', 'border-top-color'], ['.chat-code', 'border-top-color'],
  ]) await expect(page.locator(selector).first()).toHaveCSS(property, rule)
  await page.screenshot({ path: `artifacts/borderless-dark-${theme}.png` })
  await page.getByRole('button', { name: 'App controls', exact: true }).click()
  await page.getByRole('button', { name: 'Switch to islands view' }).click()
  await expect(page.locator('.visual-project')).toHaveCSS('border-top-width', '0px')
  await expect(page.locator('.visual-project')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  // Light theme treatment is intentionally not flattened or made borderless.
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('.visual-project')).toHaveCSS('border-top-width', '1px')
  await expect(page.locator('.visual-project')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
})
