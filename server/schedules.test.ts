import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { scheduleHandler } from './schedules'
import { schedulesCapability } from '../shared/schedules'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }))) })
async function setup(capabilities = [schedulesCapability]) {
  const call = vi.fn(async (route: string, input: Record<string, unknown>) => route === 'info' ? { capabilities } : route === 'schedules' ? { schedules: [], checkedAt: 123 } : { id: input.requestId || input.id, action: 'create', state: 'accepted', updatedAt: 123 })
  const server = createServer(); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  server.on('request', scheduleHandler(port, { call }))
  return { call, url: `http://127.0.0.1:${port}/api/schedules` }
}
const create = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', action: 'create', projectId: '100000000000000001', prompt: 'A complete\nmultiline instruction', sendAt: '0 12 * * 1', allowConcurrency: false }
it('fails closed for old bridges rather than inventing an empty list', async () => {
  const { call, url } = await setup([])
  const response = await fetch(url)
  expect(response.status).toBe(503); expect((await response.json()).code).toBe('unsupported')
  expect(call).toHaveBeenCalledTimes(1)
})
it('protects all schedule endpoints against cross-origin and cross-site access', async () => {
  const { call, url } = await setup()
  expect((await fetch(url, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
  expect((await fetch(url, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
  expect(call).not.toHaveBeenCalled()
})
it('validates JSON, size, IDs and exact fields without forwarding arbitrary commands', async () => {
  const { call, url } = await setup()
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(415)
  expect((await fetch(url, { method: 'PUT' })).status).toBe(405)
  const post = (value: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  expect((await post({ ...create, shell: 'bad' })).status).toBe(400)
  expect((await post({ ...create, projectId: '--help' })).status).toBe(400)
  expect((await post({ ...create, prompt: 'x'.repeat(300_000) })).status).toBe(413)
  expect((await fetch(`${url}/operations/not-a-uuid`)).status).toBe(400)
  expect(call.mock.calls.every(([route]) => route === 'info')).toBe(true)
  const response = await post(create)
  expect(response.status).toBe(202)
  expect(call).toHaveBeenCalledWith('schedule-submit', create, expect.any(AbortSignal))
})
it('returns uncached validated lists and operation receipts', async () => {
  const { call, url } = await setup()
  const response = await fetch(url)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ schedules: [], checkedAt: 123 })
  expect((await fetch(`${url}/operations/${create.requestId}`)).status).toBe(200)
  expect(call).toHaveBeenLastCalledWith('schedule-operation', { id: create.requestId }, expect.any(AbortSignal))
  expect((await fetch(`${url}/arbitrary`)).status).toBe(404)
})
