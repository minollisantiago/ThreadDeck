// THROWAWAY: preserve the real startup HTML/CSS verbatim, embedding the assets
// and adding only study 09's shader. No desktop bridge or simulated new copy.
// Run: node scripts/startup-loom-prototype.mjs [--serve]
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = relative => readFile(path.join(root, relative), 'utf8')
const [source, css, theme, shader, font] = await Promise.all([
  read('electron/startup.html'), read('electron/startup.css'), read('electron/startup-theme.js'),
  read('electron/startup-loom.prototype.js'), readFile(path.join(root, 'public/fonts/JetBrainsMono-Regular.woff2')),
])
const html = source
  .replace(/  <meta http-equiv="Content-Security-Policy"[^>]*>\n/, '')
  .replace('<script src="startup-theme.js"></script>', () => `<script>${theme}</script>`)
  .replace('<link rel="stylesheet" href="startup.css">', () => `<style>${css.replace("url('JetBrainsMono-Regular.woff2')", `url('data:font/woff2;base64,${font.toString('base64')}')`)}</style>`)
  .replace('  <script src="startup-ui.js" defer></script>\n', '')
  .replace('</body>', () => `<script>${shader}</script>\n</body>`)
  .replace('<!doctype html>', '<!doctype html>\n<!-- THROWAWAY MOCK: unchanged startup screen plus theme-colored thread loom shader. Startup rows are the original static initial state; no desktop services are started. -->')
const destination = path.join(root, 'artifacts/startup-loom-prototype/ThreadDeck-startup-loom.html')
await mkdir(path.dirname(destination), { recursive: true })
await writeFile(destination, html)
console.log(`Standalone HTML: ${destination}`)
if (process.argv.includes('--serve')) {
  const port = Number(process.env.THREADDECK_PROTOTYPE_PORT || 4794)
  createServer((request, response) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/') {
      response.writeHead(404).end('Not found')
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(html)
  }).listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${port}`))
}
