// THROWAWAY visual study: keep the sidebar layout, compare quieter session titles.
// Run: node scripts/sidebar-type.prototype.mjs (uses the existing dist build).
// No backend, mutations, or changes to production styling.
import { chromium } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('artifacts/sidebar-type-prototype')
await mkdir(output, { recursive: true })
const now = Date.now()
const titles = [
  'it would be could if we could compare layouts', 'idea',
  'Implement profile menu and preferences', 'i was thinking, do we have documentation',
  'we need to allow the user to change models', 'we have a contrast problem on light theme',
  'i want to support slash commands in chat', '### UI changes, one change → one preview',
  'how to discover new projects to show', 'Brainstorm and investigate a new workspace',
  'new idea connecting github so that we can review',
]
const sessions = titles.map((title, index) => ({ id: `session-${index}`, threadId: `1000000000000000${String(index).padStart(2, '0')}`, guildId: null, projectId: 'deck', title, status: 'idle', agentCount: 0, updatedAt: now - index * 1000, responseAt: index < 2 ? now : null }))
const snapshot = { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null, projects: [
  { id: 'gas', name: 'naturalgas', directory: '/fixture/gas', sessions: [{ id: 'gas-session', threadId: '200000000000000001', guildId: null, projectId: 'gas', title: 'Rerun the weekly NG backtesting baseline', status: 'working', agentCount: 1, updatedAt: now }] },
  { id: 'deck', name: 'ThreadDeck', directory: '/fixture/deck', sessions },
] }
const variants = [
  { key: 'A', label: 'Current · 13px', css: '/* Current production typography. */' },
  { key: 'B', label: 'Smaller + softer · 12px', css: '.chat-manager .session-title { font-size: 12px; color: color-mix(in srgb, var(--muted) 86%, var(--ground)); } .chat-manager .session-attention .session-title { color: color-mix(in srgb, var(--text) 82%, var(--ground)); }' },
  { key: 'C', label: 'Extra quiet · 11px', css: '.chat-manager .session-title { font-size: 11px; color: color-mix(in srgb, var(--muted) 76%, var(--ground)); } .chat-manager .session-attention .session-title { color: color-mix(in srgb, var(--text) 76%, var(--ground)); }' },
]
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 579, height: 1001 }, deviceScaleFactor: 1 })
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/snapshot') return route.fulfill({ json: snapshot })
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
    const file = path.resolve('dist', `.${url.pathname === '/' ? '/index.html' : url.pathname}`)
    if (!file.startsWith(`${path.resolve('dist')}/`)) return route.abort()
    try {
      const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'
      return route.fulfill({ body: await readFile(file), contentType })
    } catch { return route.abort() }
  })
  await page.addInitScript(({ snapshot, sessions }) => {
    localStorage.setItem('threaddeck:appearance', JSON.stringify('dark'))
    localStorage.setItem('threaddeck:dark-theme', JSON.stringify('charcoal'))
    localStorage.setItem('threaddeck:pinned-threads', JSON.stringify(sessions.map(session => `${session.projectId}:${session.threadId}`)))
    class FixtureStream extends EventTarget {
      constructor() { super(); queueMicrotask(() => this.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify(snapshot) }))) }
      close() {}
    }
    window.EventSource = FixtureStream
  }, { snapshot, sessions })
  await page.goto('http://sidebar-preview.test/')
  await page.locator('.session-title').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: '.chat-workspace .chat-manager, .chat-workspace .chat-sidebar-slot { width: 579px !important; max-width: 100vw; } .chat-manager-new { display: none; }' })
  const images = []
  for (const variant of variants) {
    const style = await page.addStyleTag({ content: variant.css })
    const image = await page.screenshot({ path: path.join(output, `${variant.key}.png`) })
    images.push(image.toString('base64'))
    await style.evaluate(node => node.remove())
  }
  const board = await browser.newPage({ viewport: { width: 1785, height: 1057 }, deviceScaleFactor: 1 })
  await board.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#25242b;color:#d3ced9;font:13px monospace;display:flex;gap:12px;padding:12px}figure{margin:0}figcaption{height:32px}img{display:block;width:579px;height:1001px}</style>${variants.map((variant, index) => `<figure><figcaption>${variant.key} · ${variant.label}</figcaption><img src="data:image/png;base64,${images[index]}"></figure>`).join('')}`)
  await board.screenshot({ path: path.join(output, 'comparison.png') })
  console.log(`Sidebar comparison: ${output}/comparison.png`)
} finally { await browser.close() }
