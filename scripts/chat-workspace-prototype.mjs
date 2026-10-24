// Throwaway fixture-only server. Serves a static build, never the app backend or repository.
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = await mkdtemp(path.join(process.env.TMPDIR || '/tmp/opencode', 'threaddeck-chat-prototype-'))
await build({ root, mode: 'prototype', build: { outDir: output,
  rollupOptions: { input: path.join(root, 'src/chat-workspace.prototype.html') } } })
if (process.argv.includes('--export')) {
  // A self-contained, downloadable alternative when the preview tunnel is unavailable.
  let document = await readFile(path.join(output, 'src/chat-workspace.prototype.html'), 'utf8')
  const script = document.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/)
  const stylesheet = document.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)
  const js = await readFile(path.join(output, script[1]), 'utf8')
  const font = await readFile(path.join(root, 'public/fonts/JetBrainsMono-Regular.woff2'))
  const css = (await readFile(path.join(output, stylesheet[1]), 'utf8')).replace(/url\([^)]*JetBrainsMono-Regular\.woff2[^)]*\)/g, `url(data:font/woff2;base64,${font.toString('base64')})`)
  document = document.replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
    .replace(stylesheet[0], () => `<style>${css}</style>`)
  const destination = path.join(root, 'artifacts/chat-workspace-prototype/ThreadDeck-chat-prototype.html')
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, document)
  console.log(`Standalone fixture prototype: ${destination}`)
  process.exit(0)
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain' }
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return }
  try {
    const url = new URL(request.url, 'http://localhost')
    const pathname = decodeURIComponent(url.pathname === '/' ? '/src/chat-workspace.prototype.html' : url.pathname)
    const file = path.resolve(output, `.${pathname}`)
    if (!file.startsWith(`${output}${path.sep}`)) { response.writeHead(403).end(); return }
    const data = await readFile(file)
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Cache-Control', 'no-store')
    response.writeHead(200).end(request.method === 'HEAD' ? undefined : data)
  } catch { response.writeHead(404).end('Fixture prototype: no backend routes') }
})
const port = Number(process.env.PROTOTYPE_PORT || 43139)
server.listen(port, '127.0.0.1', () => console.log(`Fixture prototype: http://localhost:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
