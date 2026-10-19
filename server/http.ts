import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Monitor } from './monitor.ts'

export function trustedRequest(request: IncomingMessage, port: number) {
  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]
  const host = request.headers.host
  if (!host || !hosts.includes(host)) return false
  const origin = request.headers.origin
  return !origin || origin === `http://${host}`
}

export function apiHandler(monitor: Pick<Monitor, 'read'>, port: number) {
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
    if (request.url.split('?')[0] !== '/api/snapshot') {
      response.writeHead(404).end(JSON.stringify({ error: 'Not found' })); return true
    }
    response.writeHead(200).end(JSON.stringify(monitor.read())); return true
  }
}
