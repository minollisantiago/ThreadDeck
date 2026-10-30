import { test, expect } from '@playwright/test'

for (const width of [320, 1440]) for (const theme of ['dark', 'light']) test(`code-copy warning sits below the box in ${theme} at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await page.addInitScript(theme => {
    localStorage.setItem('threaddeck:appearance', JSON.stringify(theme))
    let denied = true
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
      Reflect.set(window, 'lastCodeCopy', text)
      if (denied) { denied = false; throw new Error('Clipboard denied') }
    } } })
  }, theme)
  const command = 'PATH="$HOME/.bun/bin:$PATH" bunx critique --web "Review changes"'
  await page.route('**/api/snapshot', route => {
    const now = Date.now()
    return route.fulfill({ json: { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null, projects: [{ id: '100000000000000010', name: 'ThreadDeck', directory: '/fixture', sessions: [{ id: 'copy', threadId: '100000000000000001', guildId: null, projectId: '100000000000000010', title: 'Code copy warning', status: 'input', agentCount: 0, updatedAt: now }] }] } })
  })
  await page.route('**/api/events', route => route.abort())
  await page.route('**/api/chat/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/info')) return route.fulfill({ json: { protocol: 1, kimakiVersion: 'test', actor: 'local-operator', capabilities: ['history', 'changes', 'prompt'] } })
    if (url.pathname.endsWith('/catalog')) return route.fulfill({ json: { entries: [] } })
    if (url.pathname.endsWith('/changes')) return
    if (url.pathname.endsWith('/messages')) return route.fulfill({ json: { cursor: 'copy:0', before: null, stale: false, messages: [{ id: '100000000000000007', channel_id: '100000000000000001', timestamp: new Date().toISOString(), author: { id: 'human', username: 'You' }, content: `Copy this command:\n\n\`\`\`bash\n${command}\n\`\`\``, attachments: [], components: [], embeds: [] }] } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Code copy warning', exact: true }).click()
  await page.getByRole('button', { name: 'Copy code', exact: true }).click()
  const warning = page.getByRole('status').filter({ hasText: 'Couldn’t copy code. Try again.' })
  await expect(warning).toBeVisible()
  const code = await page.locator('.chat-code').boundingBox(), feedback = await warning.boundingBox()
  expect(feedback!.y).toBeGreaterThanOrEqual(code!.y + code!.height + 7)
  const colors = await warning.evaluate(node => {
    const sample = document.createElement('span'); sample.style.color = 'var(--warning)'; node.append(sample)
    const expected = getComputedStyle(sample).color; sample.remove()
    return { actual: getComputedStyle(node).color, expected, insideBox: Boolean(node.closest('.chat-code')) }
  })
  expect(colors.actual).toBe(colors.expected)
  expect(colors.insideBox).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (theme === 'dark' && width === 1440) {
    await page.mouse.move(0, 0)
    await page.locator('.chat-code-block').screenshot({ path: 'artifacts/production-chat/code-copy-warning-below-box.png', animations: 'disabled' })
  }
  await page.getByRole('button', { name: 'Copy code', exact: true }).click()
  await expect(warning).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Code copied', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'lastCodeCopy'))).toBe(`${command}\n`)
})
