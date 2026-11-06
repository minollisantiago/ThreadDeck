// Throwaway screenshot renderer. Run: node scripts/profile-prototype.mjs
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const output = path.resolve('artifacts/profile-proposals')
await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
try {
  const page = await browser.newPage({ viewport: { width: 620, height: 1132 }, deviceScaleFactor: 1 })
  const base = pathToFileURL(path.resolve('src/components/profile.prototype.html'))
  for (const variant of ['A', 'B', 'C']) {
    await page.goto(`${base.href}?variant=${variant}&capture=1`)
    await page.screenshot({ path: path.join(output, `${variant}-profile.png`) })
  }
  console.log(`Profile mockups rendered to ${output}`)
} finally {
  await browser.close()
}
