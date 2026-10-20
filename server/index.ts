import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Monitor } from './monitor.ts'
import { source } from './source.ts'
import { apiHandler } from './http.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT ?? 5173)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT')
const production = process.argv.includes('--production')
const monitor = new Monitor(source)
const api = apiHandler(monitor, port)
const vite = production ? null : await (await import('vite')).createServer({
  root, server: { middlewareMode: true, hmr: { port: port + 1, host: '127.0.0.1' } }, appType: 'spa',
})
const server = createServer((request, response) => {
  if (api(request, response)) return
  if (vite) { vite.middlewares(request, response); return }
  void (async () => {
    try {
      const pathname = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname)
      const filename = pathname.startsWith('/assets/') || pathname.startsWith('/fonts/') ? pathname.slice(1) : 'index.html'
      const file = path.resolve(root, 'dist', filename)
      if (!file.startsWith(path.join(root, 'dist') + path.sep)) { response.writeHead(404).end(); return }
      const content = await readFile(file)
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.txt') ? 'text/plain' : 'text/html'
      response.setHeader('Content-Type', `${type}; charset=utf-8`)
      response.setHeader('Cache-Control', filename === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable')
      response.end(content)
    } catch { response.writeHead(404).end('Not found') }
  })()
})
// Loopback only: this dashboard contains private session titles and is not a public service.
server.listen(port, '127.0.0.1', () => console.log(`ThreadDeck listening on http://localhost:${port}`))
let stopped = false
async function poll() {
  await monitor.refresh()
  if (!stopped) timer = setTimeout(poll, 5_000)
}
let timer: ReturnType<typeof setTimeout> | undefined
void poll()
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  stopped = true; clearTimeout(timer)
  server.close(); void vite?.close()
})
