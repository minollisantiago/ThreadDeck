// THROWAWAY: serve only the standalone HTML study, never the app or local APIs.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const html = await readFile(new URL('../electron/startup-shaders.prototype.html', import.meta.url))
const port = Number(process.env.THREADDECK_PROTOTYPE_PORT || 4793)
createServer((request, response) => {
  if (new URL(request.url, 'http://localhost').pathname !== '/') {
    response.writeHead(404).end('Not found')
    return
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(html)
}).listen(port, '127.0.0.1', () => console.log(`Local: http://localhost:${port}`))
