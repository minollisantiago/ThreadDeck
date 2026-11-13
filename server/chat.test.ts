import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { chatHandler } from './chat'
import { mkdtemp, rm, readFile, stat, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { UploadStore } from './upload-store'

const servers: ReturnType<typeof createServer>[] = []
const directories: string[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))) })
async function setup(data?: string, download?: typeof fetch) {
  const call = vi.fn(async (): Promise<unknown> => ({ protocol: 1 }))
  const server = createServer(); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const handler = chatHandler(port, { call }, data, download)
  server.on('request', (request, response) => { if (!handler(request, response)) response.writeHead(404).end() })
  return { url: `http://127.0.0.1:${port}`, call }
}
it('rejects cross-origin writes before contacting Kimaki', async () => {
  const { url, call } = await setup()
  const response = await fetch(`${url}/api/chat/submit`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })
  expect(response.status).toBe(403); expect(call).not.toHaveBeenCalled()
})
it('loads only explicitly chosen Discord profiles through a narrow local endpoint', async () => {
  const { url, call } = await setup()
  const profile = { id: '100000000000000001', username: 'santiago', displayName: 'Santiago', avatarUrl: 'https://cdn.discordapp.com/avatars/100000000000000001/abc.png?size=128' }
  call.mockResolvedValue({ profile })
  const response = await fetch(`${url}/api/chat/profile?userId=${profile.id}`)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ profile })
  expect(call).toHaveBeenLastCalledWith('profile', { userId: profile.id }, expect.any(AbortSignal))
  call.mockClear()
  expect((await fetch(`${url}/api/chat/profile?userId=../../secret`)).status).toBe(400)
  expect((await fetch(`${url}/api/chat/profile`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
  expect(call).not.toHaveBeenCalled()
  call.mockResolvedValue({ profile: { ...profile, avatarUrl: 'https://evil.example/photo.png' } })
  expect((await fetch(`${url}/api/chat/profile?userId=${profile.id}`)).status).toBe(400)
})
it('validates submission targets and never exposes an arbitrary RPC proxy', async () => {
  const { url, call } = await setup()
  expect((await fetch(`${url}/api/chat/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threadId: '../../secret' }) })).status).toBe(400)
  expect((await fetch(`${url}/api/chat/restart`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(404)
  expect(call).not.toHaveBeenCalled()
})
it('passes only validated submission fields through the local bridge', async () => {
  const { url, call } = await setup()
  const input = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', threadId: '100000000000000001', text: 'Do something', delivery: 'queue' }
  expect((await fetch(`${url}/api/chat/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status).toBe(202)
  expect(call).toHaveBeenCalledWith('submit', { ...input, kind: 'prompt', files: [] }, expect.any(AbortSignal))
})
it('rejects oversized JSON before contacting the bridge', async () => {
  const { url, call } = await setup()
  const response = await fetch(`${url}/api/chat/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(300_000) }) })
  expect(response.status).toBe(413); expect(call).not.toHaveBeenCalled()
})
it('routes project catalogs and session model discovery through narrow endpoints', async () => {
  const { url, call } = await setup()
  const id = '100000000000000001'
  expect((await fetch(`${url}/api/chat/projects/${id}/catalog`)).status).toBe(200)
  expect(call).toHaveBeenLastCalledWith('project-catalog', { projectId: id }, expect.any(AbortSignal))
  expect((await fetch(`${url}/api/chat/threads/${id}/models`)).status).toBe(200)
  expect(call).toHaveBeenLastCalledWith('models', { threadId: id }, expect.any(AbortSignal))
  expect((await fetch(`${url}/api/chat/projects/invalid/catalog`)).status).toBe(404)
})
it('stages private files with safe media extensions and rejects path names', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-upload-')); directories.push(directory)
  const { url } = await setup(directory)
  const response = await fetch(`${url}/api/chat/files?name=screen.png`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('synthetic png') })
  expect(response.status).toBe(201)
  const file = await response.json()
  const metadata = JSON.parse(await readFile(path.join(directory, 'uploads', `${file.id}.json`), 'utf8'))
  expect(metadata.path).toBe(`${file.id}.file.png`)
  expect((await stat(path.join(directory, 'uploads', metadata.path))).mode & 0o777).toBe(0o600)
  expect((await fetch(`${url}/api/chat/files?name=${encodeURIComponent('../escape.png')}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'x' })).status).toBe(400)
})
it('exposes storage usage and cleanup only through trusted local requests', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-upload-')); directories.push(directory)
  const { url, call } = await setup(directory)
  const uploaded = await fetch(`${url}/api/chat/files?name=screen.png&owner=draft`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'x' })
  expect(uploaded.status).toBe(201)
  const { id } = await uploaded.json()
  expect(await (await fetch(`${url}/api/chat/storage`)).json()).toMatchObject({ count: 1, used: 1, protected: 1, budget: 2 * 1024 ** 3 })
  const sync = await fetch(`${url}/api/chat/files/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'draft', ids: [] }) })
  expect(sync.status).toBe(200)
  expect(new UploadStore(directory).status()).toMatchObject({ reclaimable: 1, protected: 0 })
  call.mockClear()
  expect((await fetch(`${url}/api/chat/storage/clean`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403)
  expect((await fetch(`${url}/api/chat/storage/clean`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(200)
  expect(call).not.toHaveBeenCalled()
})
it('accepts the 129th upload instead of returning the old storage-full error', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-upload-')); directories.push(directory)
  const uploads = path.join(directory, 'uploads')
  await mkdir(uploads)
  await Promise.all(Array.from({ length: 128 }, () => writeFile(path.join(uploads, `${crypto.randomUUID()}.file.png`), 'x')))
  const { url } = await setup(directory)
  const response = await fetch(`${url}/api/chat/files?name=one-byte.png`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'x' })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ name: 'one-byte.png' })
  expect(new UploadStore(directory).status().count).toBe(129)
})
it('pins submitted uploads even when the bridge cannot confirm delivery', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'threaddeck-upload-')); directories.push(directory)
  const { url, call } = await setup(directory)
  const file = new UploadStore(directory).upload('screen.png', Buffer.from('x'))
  call.mockRejectedValueOnce(new Error('Uncertain delivery'))
  const response = await fetch(`${url}/api/chat/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), threadId: '100000000000000001', text: '', files: [file], delivery: 'queue' }) })
  expect(response.ok).toBe(false)
  expect(new UploadStore(directory).status()).toMatchObject({ protected: 1, reclaimable: 0 })
})
it('serves raster attachments inline without MIME metadata but keeps active content as downloads', async () => {
  const download = vi.fn<typeof fetch>(async () => new Response('synthetic bytes'))
  const { url, call } = await setup(undefined, download)
  const endpoint = `${url}/api/chat/threads/100000000000000001/messages/100000000000000002/attachments/100000000000000003`
  for (const [name, type, expected] of [['image.PNG', 'application/octet-stream', 'image/png'], ['unsafe.svg', 'image/svg+xml', 'application/octet-stream'], ['unsafe.png', 'text/html', 'application/octet-stream']]) {
    call.mockResolvedValueOnce({ messages: [{ id: '100000000000000002', channel_id: '100000000000000001', timestamp: '2026-10-24T00:00:00Z', author: { id: 'bot', username: 'Kimaki' }, attachments: [{ id: '100000000000000003', filename: name, size: 15, content_type: type, url: `https://cdn.discordapp.com/attachments/100000000000000001/100000000000000003/${name}` }] }], cursor: 'fixture:0', before: null, stale: false })
    const response = await fetch(endpoint)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(expected)
    expect(response.headers.get('content-disposition')).toMatch(expected === 'image/png' ? /^inline;/ : /^attachment;/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  }
})
it('serves audio inline with bounded byte ranges for seeking', async () => {
  const download = vi.fn<typeof fetch>(async () => new Response('0123456789'))
  const { url, call } = await setup(undefined, download)
  call.mockResolvedValue({ messages: [{ id: '100000000000000002', channel_id: '100000000000000001', timestamp: '2026-10-29T00:00:00Z', author: { id: 'human', username: 'Human' }, attachments: [{ id: '100000000000000003', filename: 'voice.ogg', size: 10, content_type: 'audio/ogg', url: 'https://cdn.discordapp.com/attachments/100000000000000001/100000000000000003/voice.ogg' }] }], cursor: 'fixture:0', before: null, stale: false })
  const endpoint = `${url}/api/chat/threads/100000000000000001/messages/100000000000000002/attachments/100000000000000003`
  const response = await fetch(endpoint, { headers: { Range: 'bytes=2-5' } })
  expect(response.status).toBe(206)
  expect(response.headers.get('content-type')).toBe('audio/ogg')
  expect(response.headers.get('content-disposition')).toMatch(/^inline;/)
  expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
  expect(await response.text()).toBe('2345')
  const suffix = await fetch(endpoint, { headers: { Range: 'bytes=-3' } })
  expect(await suffix.text()).toBe('789')
  for (const range of ['bytes=99-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'invalid']) expect((await fetch(endpoint, { headers: { Range: range } })).status).toBe(416)
})
