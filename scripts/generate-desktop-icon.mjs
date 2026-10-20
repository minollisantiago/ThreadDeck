import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

// Reuse the actual app favicon, with PNG-backed ICO entries for modern Windows.
const source = await readFile(new URL('../src/assets/favicon.svg', import.meta.url), 'utf8')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
try {
  const images = []
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${source}`)
    images.push(await page.screenshot({ omitBackground: true }))
  }
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16
    header[entry] = header[entry + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[index].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += images[index].length
  }
  await writeFile(new URL('../electron/ThreadDeck.ico', import.meta.url), Buffer.concat([header, ...images]))
  console.log('Generated electron/ThreadDeck.ico from the app favicon (16–256px).')
} finally { await browser.close() }
