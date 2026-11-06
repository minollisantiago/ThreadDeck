// THROWAWAY: static fixture-only onboarding studies. No bot, backend, credentials or disk browsing.
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = await mkdtemp('/tmp/opencode/threaddeck-onboarding-prototype-')
const currentOutput = path.join(output, 'current-build')
async function standalone(directory, entry) {
  let html = await readFile(path.join(directory, entry), 'utf8')
  for (const match of [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]) {
    const js = await readFile(path.join(directory, match[1]), 'utf8')
    html = html.replace(match[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  }
  for (const match of [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
    let css = await readFile(path.join(directory, match[1]), 'utf8')
    const font = await readFile(path.join(root, 'public/fonts/JetBrainsMono-Regular.woff2'))
    css = css.replace(/url\([^)]*JetBrainsMono-Regular\.woff2[^)]*\)/g, `url(data:font/woff2;base64,${font.toString('base64')})`)
    html = html.replace(match[0], () => `<style>${css}</style>`)
  }
  return html
}
await build({ root, mode: 'prototype', build: { outDir: currentOutput, rollupOptions: { input: path.join(root, 'src/chat/onboarding-current.prototype.html'), output: { inlineDynamicImports: true } } } })
const currentHTML = await standalone(currentOutput, 'src/chat/onboarding-current.prototype.html')
await build({ root, mode: 'prototype', define: { __ONBOARDING_CURRENT_HTML__: JSON.stringify(currentHTML) }, build: { outDir: output, emptyOutDir: false, rollupOptions: { input: path.join(root, 'src/chat/onboarding.prototype.html'), output: { inlineDynamicImports: true } } } })
const standaloneHTML = await standalone(output, 'src/chat/onboarding.prototype.html')
await writeFile(path.join(output, 'ThreadDeck-onboarding-comparison.html'), standaloneHTML)
if (process.argv.includes('--export')) {
  const destination = path.join(root, 'artifacts/onboarding-prototype/ThreadDeck-onboarding-comparison.html')
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, standaloneHTML)
  console.log(`Standalone comparison: ${destination}`)
  process.exit(0)
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return }
  try {
    const url = new URL(request.url, 'http://localhost')
    const pathname = decodeURIComponent(url.pathname === '/' ? '/src/chat/onboarding.prototype.html' : url.pathname)
    const file = path.resolve(output, `.${pathname}`)
    if (!file.startsWith(output + path.sep)) { response.writeHead(403).end(); return }
    const content = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).end(request.method === 'HEAD' ? undefined : content)
  } catch { response.writeHead(404).end('Prototype: no backend routes') }
})
const port = Number(process.env.PROTOTYPE_PORT || 5197)
server.listen(port, '127.0.0.1', () => console.log(`Onboarding prototype: http://localhost:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
