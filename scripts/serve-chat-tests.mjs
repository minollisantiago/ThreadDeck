// Serves built assets only. Browser tests intercept every API; no bot/service is started.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve('dist')
const fixture = path.resolve('artifacts/dashboard-fixture')
const types = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (pathname.startsWith('/api/')) { response.writeHead(503).end('Test server has no backend'); return }
    const dashboard = pathname.startsWith('/dashboard-fixture/')
    const directory = dashboard ? fixture : root
    const relative = dashboard ? pathname.slice('/dashboard-fixture/'.length) : pathname.startsWith('/assets/') || pathname.startsWith('/fonts/') ? `.${pathname}` : 'index.html'
    const file = path.resolve(directory, relative)
    if (!file.startsWith(`${directory}${path.sep}`)) { response.writeHead(403).end(); return }
    response.setHeader('Content-Type', types[path.extname(file)] || 'text/html')
    response.end(await readFile(file))
  } catch { response.writeHead(404).end() }
}).listen(Number(process.env.PORT || 5190), '127.0.0.1', () => console.log(`Isolated browser test server http://127.0.0.1:${process.env.PORT || 5190}`))
