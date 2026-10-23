import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Monitor } from './monitor.ts'
import type { ConversationSearch } from './search.ts'

export function trustedRequest(request: IncomingMessage, port: number) {
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]
  const host = request.headers.host
  if (!host || !hosts.includes(host)) return false
  const origin = request.headers.origin
  return !origin || origin === `http://${host}`
}

export function apiHandler(monitor: Pick<Monitor, 'read' | 'subscribe'>, port: number, search?: Pick<ConversationSearch, 'search'>) {
  return (request: IncomingMessage, response: ServerResponse): boolean => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    if (!trustedRequest(request, port)) {
      response.writeHead(403).end('Local requests only'); return true
    }
    if (!request.url?.startsWith('/api/')) return false
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json')
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      response.writeHead(405).end(JSON.stringify({ error: 'Read-only endpoint' })); return true
    }
    const pathname = request.url.split('?')[0]
    if (pathname === '/api/search' && search) {
      const query = new URL(request.url, 'http://localhost').searchParams.get('q') ?? ''
      try { response.writeHead(200).end(JSON.stringify(search.search(query))) }
      catch { response.writeHead(503).end(JSON.stringify({ error: 'Search unavailable' })) }
      return true
    }
    if (pathname === '/api/events') {
      response.setHeader('Content-Type', 'text/event-stream')
      response.setHeader('X-Accel-Buffering', 'no')
      response.writeHead(200)
      response.flushHeaders()
      // While a client is slow, retain only the latest snapshot rather than history.
      let blockedAt = 0
      let latest: ReturnType<Monitor['read']> | undefined
      const send = (snapshot: ReturnType<Monitor['read']>) => {
        if (blockedAt) { latest = snapshot; return }
        if (!response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`)) blockedAt = Date.now()
      }
      response.on('drain', () => {
        blockedAt = 0
        if (latest) { const snapshot = latest; latest = undefined; send(snapshot) }
      })
      const unsubscribe = monitor.subscribe(send)
      const heartbeat = setInterval(() => {
        if (blockedAt) {
          if (Date.now() - blockedAt >= 45_000) response.destroy()
        } else if (!response.write(': heartbeat\n\n')) blockedAt = Date.now()
      }, 15_000)
      response.on('close', () => { clearInterval(heartbeat); unsubscribe() })
      response.write('retry: 1000\n\n')
      send(monitor.read())
      return true
    }
    if (pathname !== '/api/snapshot') {
      response.writeHead(404).end(JSON.stringify({ error: 'Not found' })); return true
    }
    response.writeHead(200).end(JSON.stringify(monitor.read())); return true
  }
}
