import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { sessionHandler, renameSession } from './sessions.ts'
import type { Snapshot } from '../shared/model.ts'

vi.mock('node:child_process', () => ({ execFile: vi.fn((_file, _args, _options, callback) => callback(null, '', '')) }))
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})
async function fixture() {
  const snapshot: Snapshot = { projects: [{ id: 'p', name: 'Project', directory: '/project', sessions: [{ id: 'ses_test', projectId: 'p', threadId: '100000000000000001', guildId: null, title: 'Original', status: 'working', agentCount: 1, updatedAt: 1 }] }], health: 'connected', checkedAt: 1, lastSuccessAt: 1, attentionAvailable: true, inventoryLimited: false, message: null }
  const monitor = { read: () => snapshot, refresh: vi.fn(async () => snapshot) }, rename = vi.fn(async (_id: string, _title: string) => {})
  const server = createServer(); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  server.on('request', sessionHandler(port, monitor, rename))
  const url = `http://127.0.0.1:${port}/api/sessions/ses_test/rename`
  const post = (body: unknown, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { url, post, rename, monitor, snapshot }
}
it('renames the linked working conversation and refreshes the shared inventory', async () => {
  const { post, rename, monitor } = await fixture()
  expect((await post({ title: '  New name  ' })).status).toBe(200)
  expect(rename).toHaveBeenCalledExactlyOnceWith('100000000000000001', 'New name')
  expect(monitor.refresh).toHaveBeenCalledWith(true)
})
it.each(['', '   ', 'a'.repeat(101), 'two\nlines', '\0'])('rejects invalid name %j', async title => {
  const { post, rename } = await fixture()
  expect((await post({ title })).status).toBe(400)
  expect(rename).not.toHaveBeenCalled()
})
it('rejects cross-origin access, wrong methods, oversized bodies and unlinked targets', async () => {
  const { url, post, rename, snapshot } = await fixture()
  expect((await post({ title: 'New' }, { Origin: 'https://evil.example' })).status).toBe(403)
  expect((await post({ title: 'New' }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
  expect((await fetch(url)).status).toBe(405)
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(415)
  expect((await post({ title: 'a'.repeat(5000) })).status).toBe(413)
  snapshot.projects[0].sessions = []
  expect((await post({ title: 'New' })).status).toBe(404)
  expect(rename).not.toHaveBeenCalled()
})
it('refreshes after partial failure and does not leak CLI errors or retry', async () => {
  const { post, rename, monitor } = await fixture()
  rename.mockRejectedValueOnce(new Error('secret diagnostics'))
  const response = await post({ title: 'New' })
  expect(response.status).toBe(503)
  const text = await response.text()
  expect(text).toContain('session title may have changed')
  expect(text).not.toContain('secret')
  expect(rename).toHaveBeenCalledTimes(1)
  expect(monitor.refresh).toHaveBeenCalledWith(true)
})
it('passes user titles as a single argument after the option terminator', async () => {
  const { execFile } = await import('node:child_process')
  await renameSession('100000000000000001', '--help $(touch /bad)')
  expect(execFile).toHaveBeenCalledWith('kimaki', ['session', 'title', '--session', '100000000000000001', '--', '--help $(touch /bad)'], expect.objectContaining({ timeout: 30_000 }), expect.any(Function))
})
