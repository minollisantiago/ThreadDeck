import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createClientBridge, type BridgeAdapter } from '../integrations/kimaki/bridge-core'

const id = '100000000000000001', mid = '100000000000000002'
const message = { id: mid, channel_id: id, content: 'Published Discord text', timestamp: '2026-10-24T00:00:00Z', author: { id: 'bot', username: 'Kimaki', bot: true }, components: [{ type: 17, components: [{ type: 10, content: 'A real callout' }] }] }
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup(overrides: Partial<BridgeAdapter> = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'threaddeck-bridge-'))
  const adapter: BridgeAdapter = { linked: thread => thread === id, threads: async () => ({}), history: async () => [message], validate: async () => {}, create: async () => ({ threadId: id, sessionId: 'ses_new' }), publish: vi.fn(async (_input, _thread, progress) => progress(mid)), dispatch: vi.fn(async () => {}), catalog: async () => ({ entries: [] }), file: async () => ({}), abort: async () => {}, ...overrides }
  const filename = path.join(dir, 'operations.db')
  let bridge = createClientBridge(adapter, filename)
  cleanups.push(async () => { await bridge.stop(); await rm(dir, { recursive: true }) })
  const call = (route: string, input: Record<string, unknown> = {}) => bridge.handle(route, input, new AbortController().signal)
  return { get bridge() { return bridge }, adapter, call, filename, async restart() { await bridge.stop(); bridge = createClientBridge(adapter, filename) } }
}
it('returns the published payload including Components V2, never a harness transcript', async () => {
  const { call } = await setup()
  const result = await call('snapshot', { threadId: id })
  expect(result).toMatchObject({ data: { ok: true, value: { messages: [{ content: message.content, components: message.components }] } } })
  expect(await call('snapshot', { threadId: '100000000000000099' })).toMatchObject({ data: { ok: false, error: { code: 'unlinked' } } })
})
it('merges updates and delete tombstones recorded during a history fetch', async () => {
  let finish!: (messages: unknown[]) => void
  const { bridge, call } = await setup({ history: () => new Promise(resolve => { finish = resolve }) })
  const snapshot = call('snapshot', { threadId: id })
  bridge.ingest('MESSAGE_DELETE', { channel_id: id, id: mid })
  finish([message])
  expect(await snapshot).toMatchObject({ data: { ok: true, value: { messages: [] } } })
})
it('merges partial Gateway edits before a message has been fetched into the projection', async () => {
  let finish!: (messages: unknown[]) => void
  const { bridge, call } = await setup({ history: () => new Promise(resolve => { finish = resolve }) })
  const snapshot = call('snapshot', { threadId: id })
  bridge.ingest('MESSAGE_UPDATE', { channel_id: id, id: mid, content: 'Edited while fetching', edited_timestamp: '2026-10-24T00:01:00Z' })
  finish([message])
  expect(await snapshot).toMatchObject({ data: { ok: true, value: { messages: [{ content: 'Edited while fetching' }] } } })
})
it('deduplicates concurrent submissions, publishes before dispatch and detects conflicts', async () => {
  const order: string[] = []
  const { call, adapter } = await setup({ publish: vi.fn(async (_i, _t, progress) => { order.push('publish'); progress(mid) }), dispatch: vi.fn(async () => { order.push('dispatch') }) })
  const input = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', threadId: id, text: 'A prompt', delivery: 'send' }
  await Promise.all([call('submit', input), call('submit', input)])
  await vi.waitFor(() => expect(adapter.dispatch).toHaveBeenCalledTimes(1))
  expect(order).toEqual(['publish', 'dispatch'])
  expect(await call('operation', { id: input.requestId })).toMatchObject({ data: { ok: true, value: { state: 'submitted', messageIds: [mid] } } })
  expect(await call('submit', { ...input, text: 'Different content' })).toMatchObject({ data: { ok: false, error: { code: 'conflict' } } })
})
it('never dispatches after ambiguous publication failure or silently retries it', async () => {
  const { call, adapter } = await setup({ publish: vi.fn(async () => { throw new Error('lost response') }) })
  const input = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', threadId: id, text: 'A prompt', delivery: 'send' }
  await call('submit', input)
  await vi.waitFor(async () => expect(await call('operation', { id: input.requestId })).toMatchObject({ data: { ok: true, value: { state: 'unknown' } } }))
  await call('submit', input)
  expect(adapter.publish).toHaveBeenCalledTimes(1); expect(adapter.dispatch).not.toHaveBeenCalled()
})
it('requests a resnapshot after a connection epoch changes', async () => {
  const { bridge, call } = await setup()
  const snapshot = await call('snapshot', { threadId: id })
  const cursor = (snapshot.data as { value: { cursor: string } }).value.cursor
  bridge.connection(false)
  expect(await call('changes', { threadId: id, cursor })).toMatchObject({ data: { ok: true, value: { resync: true, stale: true } } })
})
it.each(['dispatching', 'transcribing'])('recovers interrupted %s receipts as unknown rather than replaying them', async state => {
  const { call, adapter, filename, restart } = await setup()
  const id = '7c18b13a-6d07-419d-b54f-e8024fc91673'
  const db = new DatabaseSync(filename)
  db.prepare('INSERT INTO operations VALUES (?, ?, ?)').run(id, 'hash', JSON.stringify({ id, state, messageIds: ['100000000000000002'], updatedAt: 1 }))
  db.close()
  await restart()
  expect(await call('operation', { id })).toMatchObject({ data: { ok: true, value: { state: 'unknown', messageIds: ['100000000000000002'] } } })
  expect(adapter.dispatch).not.toHaveBeenCalled(); expect(adapter.publish).not.toHaveBeenCalled()
})
it('advertises audio only when supported and rejects older adapters without publishing', async () => {
  const { call, adapter } = await setup()
  const files = [{ id: '7c18b13a-6d07-419d-b54f-e8024fc91673', name: 'voice.ogg', audioPrompt: true }]
  expect(await call('submit', { requestId: files[0].id, threadId: id, text: '', delivery: 'send', files })).toMatchObject({ data: { ok: false, error: { code: 'unsupported' } } })
  expect(adapter.publish).not.toHaveBeenCalled()
})
it('publishes recording, transcribes once, publishes transcript and only then dispatches', async () => {
  const order: string[] = []
  const transcribe: BridgeAdapter['transcribe'] = vi.fn(async (input, _thread, _message, progress) => {
    order.push('transcribe'); progress('100000000000000003')
    return { ...input, text: 'Transcribed task', files: [] }
  })
  const { call, adapter } = await setup({ publish: async (_input, _thread, progress) => { order.push('publish'); progress(mid) }, transcribe, dispatch: vi.fn(async () => { order.push('dispatch') }) })
  const input = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', threadId: id, text: '', delivery: 'queue', files: [{ id: '7c18b13a-6d07-419d-b54f-e8024fc91674', name: 'voice.ogg', audioPrompt: true }] }
  await Promise.all([call('submit', input), call('submit', input)])
  await vi.waitFor(() => expect(adapter.dispatch).toHaveBeenCalledTimes(1))
  expect(order).toEqual(['publish', 'transcribe', 'dispatch'])
  expect(transcribe).toHaveBeenCalledTimes(1)
  expect(adapter.dispatch).toHaveBeenCalledWith(expect.objectContaining({ text: 'Transcribed task', delivery: 'queue', files: [] }), id, mid)
  expect(await call('operation', { id: input.requestId })).toMatchObject({ data: { ok: true, value: { state: 'submitted', messageIds: [mid, '100000000000000003'] } } })
})
it('does not dispatch or automatically retry after transcription or transcript publication fails', async () => {
  const transcribe = vi.fn(async () => { throw new Error('transcription failed') })
  const { call, adapter } = await setup({ transcribe })
  const input = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', threadId: id, text: '', delivery: 'send', files: [{ id: '7c18b13a-6d07-419d-b54f-e8024fc91674', name: 'voice.ogg', audioPrompt: true }] }
  await call('submit', input)
  await vi.waitFor(async () => expect(await call('operation', { id: input.requestId })).toMatchObject({ data: { ok: true, value: { state: 'unknown', messageIds: [mid] } } }))
  await call('submit', input)
  expect(transcribe).toHaveBeenCalledTimes(1)
  expect(adapter.dispatch).not.toHaveBeenCalled()
})
