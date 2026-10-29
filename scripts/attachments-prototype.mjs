// THROWAWAY: fixture-only attachment studies. Never starts a bot or exposes project files.
// Run: npm exec -- node scripts/attachments-prototype.mjs
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFile, mkdtemp } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = await mkdtemp('/tmp/opencode/threaddeck-attachment-prototype-')
await build({ root, mode: 'prototype', build: { outDir: output, rollupOptions: { input: path.join(root, 'src/chat/attachments.prototype.html') } } })
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return }
  try {
    const url = new URL(request.url, 'http://localhost')
    const file = path.resolve(output, `.${decodeURIComponent(url.pathname === '/' ? '/src/chat/attachments.prototype.html' : url.pathname)}`)
    if (!file.startsWith(output + path.sep)) { response.writeHead(403).end(); return }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(request.method === 'HEAD' ? undefined : await readFile(file))
  } catch { response.writeHead(404).end('Attachment prototype: no backend routes') }
})
const port = Number(process.env.PROTOTYPE_PORT || 5198)
server.listen(port, '127.0.0.1', () => console.log(`Attachment prototype: http://localhost:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
