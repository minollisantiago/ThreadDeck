// THROWAWAY: compare background/contrast only, keeping the real dashboard layout.
// Run: node scripts/render-light-theme-prototype.mjs
// Synthetic API responses; no production theme changes or real service access.
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('artifacts/light-theme-proposals')
const variants = [
  { key: 'A', name: 'Porcelain', description: 'Neutral gray canvas · white panels · crisp graphite text', ground: '#e8ebee', surface: '#ffffff', row: '#edf0f3', hover: '#e0e5ea', text: '#171c24', muted: '#424d5c', subtle: '#596675', rule: '#bdc6d0', neutral: '#e1e6ec' },
  { key: 'B', name: 'Warm paper', description: 'Oat canvas · ivory panels · warm charcoal text', ground: '#e9e3d7', surface: '#fffdf7', row: '#f1ecdf', hover: '#e7dfce', text: '#29261f', muted: '#514b40', subtle: '#686052', rule: '#c7bcaa', neutral: '#e8e0d1' },
  { key: 'C', name: 'Cool slate', description: 'Blue-gray canvas · cool white panels · strongest separation', ground: '#d7e1ea', surface: '#f8fbff', row: '#e5edf5', hover: '#d8e4ef', text: '#142438', muted: '#354b61', subtle: '#4f657a', rule: '#a4b7ca', neutral: '#dce6f1' },
]
const css = v => `:root[data-appearance=light] {
  --ground:${v.ground};--surface:${v.surface};--row:${v.row};--hover:${v.hover};
  --text:${v.text};--muted:${v.muted};--subtle:${v.subtle};--rule:${v.rule};
  --accent:#b52e60;--working:#17623c;--warning:#80500b;--danger:#a52238;
  --pill-neutral-bg:${v.neutral};--pill-working-ink:#145c35;--pill-working-bg:#d5eddf;
  --pill-attention-ink:#764508;--pill-attention-bg:#f7e5be;
  --pill-accent-ink:#92204c;--pill-accent-bg:#f5dce5;
  --pill-danger-ink:#981d35;--pill-danger-bg:#f8dce2;
}
.project-panel {border:1px solid var(--rule)}
.search-field input {border:1px solid var(--rule)}
.brand-icon {color:var(--accent)}
.session-title {color:var(--muted)}
.project-heading {background:color-mix(in srgb,var(--row) 45%,var(--surface))}
`
await mkdir(output, { recursive: true })
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 }, reducedMotion: 'reduce', colorScheme: 'light' })
  await page.route('**/api/**', route => {
    const now = Date.now()
    const project = (name, titles) => ({ id: name, name, directory: `/mock/${name}`, sessions: titles.map(([title, status, unread], index) => ({
      id: `${name}-${index}`, projectId: name, title, status, agentCount: status === 'working' ? 1 : 0,
      guildId: null, threadId: `${index}`, updatedAt: now - index * 60000, responseAt: unread ? now - 1000 : null,
    })) })
    return route.fulfill({ json: { health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
      projects: [project('ThreadDeck', [['Refine the light theme contrast', 'working'], ['Review desktop launcher flow', 'permission'], ['Polish startup loading', 'idle', true]]),
        project('WeekTrace', [['Windows activity import', 'working'], ['Review the weekly report', 'idle', true]]),
        project('naturalgas', [['Compare saved backtests', 'working'], ['Investigate failed data refresh', 'error']])],
    } })
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.locator('.project-panel').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  const original = await page.screenshot({ path: path.join(output, 'current.png') })
  const images = []
  for (const v of variants) {
    const style = await page.addStyleTag({ content: css(v) })
    await page.setViewportSize({ width: 1280, height: 920 })
    const desktop = await page.screenshot({ path: path.join(output, `${v.key}-desktop.png`) })
    await page.setViewportSize({ width: 430, height: 1050 })
    const mobile = await page.screenshot({ path: path.join(output, `${v.key}-mobile.png`) })
    const board = await browser.newPage({ viewport: { width: 1770, height: 1160 }, deviceScaleFactor: 1 })
    await board.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#171b23;color:#f5f6f8;font:16px system-ui;padding:24px}header{height:65px;display:flex;justify-content:space-between;align-items:start}h1{font-size:24px;margin:0 0 7px}p{margin:0;color:#b9c3d0}.screens{display:flex;gap:18px;align-items:start}img{border:1px solid #ffffff25;border-radius:10px}.desktop{width:1280px}.mobile{width:430px}</style><header><div><h1>${v.key} / ${v.name}</h1><p>${v.description}</p></div><p>LIGHT THEME STUDY · SAME LAYOUT / SAMPLE DATA</p></header><div class="screens"><img class="desktop" src="data:image/png;base64,${desktop.toString('base64')}"><img class="mobile" src="data:image/png;base64,${mobile.toString('base64')}"></div>`)
    await board.screenshot({ path: path.join(output, `${v.key}-comparison.png`) })
    await board.close()
    images.push({ ...v, image: desktop.toString('base64') })
    await style.evaluate(element => element.remove())
  }
  // A compact contact sheet makes the background differences easy to judge.
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 1650 } })
  const options = [{ key: 'Current', name: 'Existing light theme', ground: '#f4f3f6', image: original.toString('base64') }, ...images]
  await sheet.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#171b23;color:white;font:18px system-ui}h1{font-size:26px;margin:0 0 8px}p{margin:0 0 24px;color:#b9c3d0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.label{display:flex;align-items:center;gap:12px;margin-bottom:12px}.swatch{width:22px;height:22px;border:1px solid #ffffff66;border-radius:50%}img{width:100%;border-radius:8px;border:1px solid #ffffff22}</style><h1>ThreadDeck / Light background & contrast alternatives</h1><p>Current vs three directions · identical content and layout · pink accent retained, darkened for readability</p><div class="grid">${options.map(v => `<section><div class="label"><span class="swatch" style="background:${v.ground}"></span><b>${v.key} / ${v.name}</b><span>${v.ground}</span></div><img src="data:image/png;base64,${v.image}"></section>`).join('')}</div>`)
  await sheet.screenshot({ path: path.join(output, 'overview.png'), fullPage: true })
  await sheet.close()
  await writeFile(path.join(output, 'palettes.json'), JSON.stringify(variants, null, 2))
  console.log(`Light theme mockups rendered to ${output}`)
} finally {
  await browser.close()
  await server.close()
}
