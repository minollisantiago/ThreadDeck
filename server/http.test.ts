import { createServer, get } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it } from 'vitest'
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
  server.on('request', apiHandler({ read: () => snapshot }, port))
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
