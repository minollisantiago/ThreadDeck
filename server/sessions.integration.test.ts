import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { sessionHandler } from './sessions.ts'
import type { Snapshot } from '../shared/model.ts'

const servers: ReturnType<typeof createServer>[] = [], directories: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function listen(server: ReturnType<typeof createServer>) {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-rename-')); directories.push(directory)
  const token = 'a'.repeat(64)
  await writeFile(path.join(directory, 'lock-token'), token, { mode: 0o600 })
  const calls: { route?: string; authorization?: string; body: unknown }[] = []
  let status = 200, invalidResponse = false
  const lockPort = await listen(createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      calls.push({ route: request.url, authorization: request.headers.authorization, body })
      response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(status === 200 ? invalidResponse ? {} : { title: body.text } : { error: 'private bot diagnostics' }))
    })()
  }))
  vi.stubEnv('KIMAKI_DATA_DIR', directory)
  vi.stubEnv('KIMAKI_LOCK_PORT', String(lockPort))
  const snapshot: Snapshot = { projects: [{ id: 'p', name: 'Project', directory: '/project', sessions: [{ id: 'ses_test', projectId: 'p', threadId: '100000000000000001', guildId: null, title: 'Original', status: 'working', agentCount: 1, updatedAt: 1 }] }], health: 'connected', checkedAt: 1, lastSuccessAt: 1, attentionAvailable: true, inventoryLimited: false, message: null }
  const monitor = { read: () => snapshot, refresh: vi.fn(async () => snapshot) }
  const server = createServer(), port = await listen(server)
  server.on('request', sessionHandler(port, monitor))
  const rename = (title: string) => fetch(`http://127.0.0.1:${port}/api/sessions/ses_test/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
  return { rename, calls, monitor, token, directory, fail: () => { status = 500 }, invalid: () => { invalidResponse = true } }
}
it.each(['IOL Connection', '--help', '-s', '$(touch /bad) "quoted"'])('renames %j through the real server-to-Kimaki transport, not a mocked command', async title => {
  const { rename, calls, monitor, token } = await fixture()
  const response = await rename(title)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ title })
  expect(calls).toEqual([{ route: '/kimaki/session.title', authorization: `Bearer ${token}`, body: { threadId: '100000000000000001', text: title } }])
  expect(monitor.refresh).toHaveBeenCalledWith(true)
})
it('keeps native failures guarded, refreshes and never automatically retries', async () => {
  const { rename, calls, monitor, fail } = await fixture()
  fail()
  const response = await rename('IOL Connection')
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private bot diagnostics')
  expect(calls).toHaveLength(1)
  expect(monitor.refresh).toHaveBeenCalledWith(true)
})
it('does not report success for an incompatible response', async () => {
  const { rename, invalid } = await fixture()
  invalid()
  expect((await rename('IOL Connection')).status).toBe(503)
})
it('rejects invalid lock credentials before contacting Kimaki', async () => {
  const { rename, directory, calls } = await fixture()
  await writeFile(path.join(directory, 'lock-token'), 'invalid')
  expect((await rename('IOL Connection')).status).toBe(503)
  expect(calls).toHaveLength(0)
})
