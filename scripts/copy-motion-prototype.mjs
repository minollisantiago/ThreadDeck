// THROWAWAY: fixture-only copy animation preview. No application/backend access.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const html = await readFile(new URL('../src/chat/copy-motion.prototype.html', import.meta.url))
const port = Number(process.env.PROTOTYPE_PORT || 43143)
createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return }
  if (new URL(request.url, 'http://localhost').pathname !== '/') { response.writeHead(404).end(); return }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(request.method === 'HEAD' ? undefined : html)
}).listen(port, '127.0.0.1', () => console.log(`Copy motion prototype: http://localhost:${port}`))
