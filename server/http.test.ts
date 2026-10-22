import { createServer, get } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { apiHandler } from './http.ts'
import type { Snapshot } from '../shared/model.ts'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve())))) })
async function setup() {
  const snapshot: Snapshot = { projects: [], health: 'disconnected', checkedAt: 0, lastSuccessAt: null, attentionAvailable: false, inventoryLimited: false, message: null }
  const server = createServer()
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const listeners = new Set<(next: Snapshot) => void>()
  server.on('request', apiHandler({ read: () => snapshot, subscribe: listener => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  } }, port))
  Object.assign(server, { listeners })
  return `http://127.0.0.1:${port}`
}
it('serves only the sanitized snapshot, without caching', async () => {
  const base = await setup(), response = await fetch(`${base}/api/snapshot`)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect((await response.json()).health).toBe('disconnected')
})
it('rejects mutation requests', async () => {
  expect((await fetch(`${await setup()}/api/snapshot`, { method: 'POST' })).status).toBe(405)
})
it('rejects cross-origin requests and DNS-rebinding hosts', async () => {
  const base = await setup()
  expect((await fetch(`${base}/api/snapshot`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403)
  const status = await new Promise<number | undefined>((resolve, reject) => {
    get(`${base}/api/snapshot`, { headers: { Host: 'untrusted.example' } }, response => {
      response.resume(); resolve(response.statusCode)
    }).on('error', reject)
  })
  expect(status).toBe(403)
})

it('streams the current snapshot immediately and subsequent updates, then unsubscribes', async () => {
  const base = await setup()
  const controller = new AbortController()
  const response = await fetch(`${base}/api/events`, { signal: controller.signal })
  expect(response.headers.get('content-type')).toBe('text/event-stream')
  expect(response.headers.get('cache-control')).toBe('no-store')
  const reader = response.body!.getReader(), decoder = new TextDecoder()
  const first = decoder.decode((await reader.read()).value)
  expect(first).toContain('event: snapshot\ndata: ')
  expect(first).toContain('"health":"disconnected"')
  const server = servers.at(-1)! as typeof servers[number] & { listeners: Set<(next: Snapshot) => void> }
  expect(server.listeners.size).toBe(1)
  for (const listener of server.listeners) listener({ projects: [], health: 'connected', checkedAt: 123, lastSuccessAt: 123, attentionAvailable: true, inventoryLimited: false, message: null })
  expect(decoder.decode((await reader.read()).value)).toContain('"checkedAt":123')
  controller.abort()
  await vi.waitFor(() => expect(server.listeners.size).toBe(0))
})

it('protects the event stream against cross-origin access and mutations', async () => {
  const base = await setup()
  expect((await fetch(`${base}/api/events`, { headers: { Origin: 'https://untrusted.example' } })).status).toBe(403)
  expect((await fetch(`${base}/api/events`, { method: 'POST' })).status).toBe(405)
})
