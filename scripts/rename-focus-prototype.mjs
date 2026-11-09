// THROWAWAY screenshot runner. No dev server, live data, or production changes.
// Run: node scripts/rename-focus-prototype.mjs
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = '/tmp/opencode/rename-focus-prototype.png'
await mkdir('/tmp/opencode', { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1080, height: 455 }, deviceScaleFactor: 2 })
await page.goto(new URL('../src/components/rename-focus.prototype.html?compare=1', import.meta.url).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: output, fullPage: true })
await browser.close()
console.log(`Mockup: ${output}\nSource: ${fileURLToPath(new URL('../src/components/rename-focus.prototype.html', import.meta.url))}`)
