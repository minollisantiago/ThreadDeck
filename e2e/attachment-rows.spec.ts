import { randomUUID } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'

const threadId = '100000000000000001', projectId = '100000000000000010'
const longName = 'Global_Markets_Daily_-_G3_Inflation_Pricing_Common_Shocks_Different_Paths.pdf'
const chart = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240"><rect width="640" height="240" fill="#202027"/><text x="24" y="40" fill="#ddd" font-family="monospace" font-size="18">Inflation outlook</text><path d="M24 80L120 100L240 95L360 155L480 175L615 200" fill="none" stroke="#ed8caa" stroke-width="4"/></svg>'

async function fixture(page: Page, theme: string) {
  await page.addInitScript(theme => localStorage.setItem('threaddeck:appearance', JSON.stringify(theme)), theme)
  await page.route('**/api/snapshot', route => {
    const now = Date.now()
    return route.fulfill({ json: { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null, projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture', sessions: [{ id: 'ses_files', threadId, projectId, guildId: null, title: 'Attachment rows', status: 'input', agentCount: 0, updatedAt: now }] }] } })
  })
  await page.route('**/api/chat/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/info')) return route.fulfill({ json: { protocol: 1, kimakiVersion: 'test', actor: 'local-operator', capabilities: ['history', 'changes', 'prompt'] } })
    if (url.pathname.endsWith('/changes')) return
    if (url.pathname.endsWith('/catalog')) return route.fulfill({ json: { entries: [] } })
    if (url.pathname.endsWith('/files')) return route.fulfill({ json: { id: randomUUID(), name: url.searchParams.get('name') } })
    if (url.pathname.endsWith('/attachments/image')) return route.fulfill({ contentType: 'image/svg+xml', body: chart })
    if (url.pathname.endsWith('/attachments/html')) return route.fulfill({ contentType: 'text/html', body: '<h1>Market dashboard</h1>' })
    if (url.pathname.endsWith('/messages')) return route.fulfill({ json: { cursor: 'files:0', before: null, stale: false, messages: [{ id: '100000000000000007', channel_id: threadId, timestamp: new Date().toISOString(), author: { id: 'human', username: 'You' }, content: 'Review these reports. Keep the screenshot preview as it is.', components: [], embeds: [], attachments: [
      { id: 'pdf', filename: longName, size: 577 * 1024 },
      { id: 'html', filename: 'market_dashboard.html', size: 92 * 1024, content_type: 'text/html' },
      { id: 'csv', filename: 'inflation_forecast_2026.csv', size: 18 * 1024 },
      { id: 'zip', filename: 'charts_and_source_data.zip', size: 2505 * 1024 },
      { id: 'unicode', filename: 'Prévisions_économiques_日本語_2026.xlsx', size: 1024 },
      { id: 'empty', filename: 'empty.txt', size: 0 },
      { id: 'image', filename: 'inflation-chart.png', size: 2048, width: 640, height: 240, content_type: 'image/png' },
    ] }] } })
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  await page.locator('.chat-manager').getByRole('button', { name: 'Attachment rows', exact: true }).click()
  await expect(page.locator('.chat-attachment-row')).toHaveCount(6)
}

for (const width of [320, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['dark', 'light']) test(`quiet file rows stay one line at ${width}px in ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1080 })
  await fixture(page, theme)
  const rows = page.locator('.chat-attachments > .chat-attachment-row')
  for (const row of await rows.all()) {
    const layout = await row.evaluate(node => {
      const r = node.getBoundingClientRect(), name = node.querySelector('.chat-attachment-name')!, n = name.getBoundingClientRect(), w = node.querySelector('.chat-attachment-size')!.getBoundingClientRect(), a = node.querySelector('.chat-attachment-actions')!.getBoundingClientRect()
      return { height: r.height, nameWidth: n.width, nameRight: n.right, weightLeft: w.left, weightRight: w.right, actionsLeft: a.left, actionsRight: a.right, right: r.right, overflow: getComputedStyle(name).textOverflow }
    })
    expect(layout.height).toBeLessThanOrEqual(50)
    expect(layout.nameWidth).toBeGreaterThan(8)
    expect(layout.nameRight).toBeLessThanOrEqual(layout.weightLeft)
    expect(layout.weightRight).toBeLessThanOrEqual(layout.actionsLeft)
    expect(layout.actionsRight).toBeLessThanOrEqual(layout.right)
    expect(layout.overflow).toBe('ellipsis')
  }
  await expect(page.locator('.chat-image')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Enlarge inflation-chart.png', exact: true })).toBeVisible()
  await expect(page.getByText('0 B', { exact: true })).toBeVisible()
  await expect(page.getByText('2.4 MiB', { exact: true })).toBeVisible()
  const pdf = page.getByRole('link', { name: `Download ${longName}`, exact: true })
  await expect(pdf).toHaveAttribute('download', longName)
  await expect(pdf).toHaveText('')
  await pdf.hover()
  await expect(page.getByRole('tooltip', { name: 'Download file', exact: true })).toBeVisible()
  const filename = rows.first().locator('.chat-attachment-name')
  await filename.focus()
  await expect(page.getByRole('tooltip', { name: longName, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('.chat-composer input[type=file]').setInputFiles([{ name: 'draft-report.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(1024) }, { name: 'empty-draft.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }])
  const staged = page.locator('.chat-staged-files > .chat-attachment-row')
  await expect(staged).toHaveCount(2)
  await expect(staged.first().locator('.chat-attachment-size')).toHaveText('1 KiB')
  await expect(staged.last().locator('.chat-attachment-size')).toHaveText('0 B')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (theme === 'dark' && [430, 1440].includes(width)) {
    await page.getByRole('textbox', { name: 'Write a prompt' }).focus()
    await page.screenshot({ path: `artifacts/production-chat/quiet-attachment-rows-${width}.png`, animations: 'disabled' })
  }
  await page.getByRole('button', { name: 'Remove draft-report.pdf', exact: true }).click()
  await expect(staged).toHaveCount(1)
})

test('HTML preview still requires the existing trust choice', async ({ page }) => {
  await fixture(page, 'dark')
  await page.getByRole('button', { name: 'Preview HTML', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Trust this HTML file?' })).toBeVisible()
  await page.getByRole('button', { name: 'Safe preview', exact: true }).click()
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', '')
  await expect(page.locator('iframe')).toHaveAttribute('srcdoc', /Market dashboard/)
})
