// @vitest-environment jsdom
import { createHash, webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConversationPane } from './pane'
import type { PublishedMessage } from '../../shared/chat'
import type { Project, Session } from '../../shared/model'

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const session: Session = { id: 'ses_test', projectId: '100000000000000010', threadId: '100000000000000001', guildId: null, title: 'Test', status: 'idle', agentCount: 0, updatedAt: 1 }
const project: Project = { id: session.projectId, name: 'Test', directory: '/test', sessions: [session] }
const nonce = (id: string) => createHash('sha256').update(`${id}:0`).digest('hex').slice(0, 24)
const published = (id: string, operation: string): PublishedMessage => ({ id, channel_id: session.threadId!, author: { id: 'bot', username: 'Kimaki', bot: true }, timestamp: new Date().toISOString(), content: '**ThreadDeck · local operator**\n\nSame prompt', nonce: nonce(operation), attachments: [], components: [], embeds: [] })

async function setup(history: PublishedMessage[] = [], recovered?: { id: string; nonce?: string }) {
  vi.stubGlobal('crypto', webcrypto)
  let operation = '', publish: ((message: PublishedMessage) => void) | undefined
  const response = (json: unknown) => Promise.resolve(new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', vi.fn((path: string, options?: RequestInit) => {
    if (path.endsWith('/info')) return response({ protocol: 1, kimakiVersion: 'test', actor: 'local-operator', capabilities: ['history', 'changes', 'prompt'] })
    if (path.endsWith('/catalog')) return response({ entries: [] })
    if (path.endsWith('/messages')) return response({ messages: history, cursor: 'test:0', before: null, stale: false })
    if (path.includes('/changes?')) return new Promise<Response>(resolve => { publish = message => resolve(new Response(JSON.stringify({ cursor: `test:${message.id}`, resync: false, stale: false, changes: [{ type: 'upsert', message }] }))) })
    if (path.endsWith('/submit')) {
      operation = JSON.parse(String(options?.body)).requestId
      return response({ id: operation, state: 'accepted', messageIds: [], updatedAt: 1 })
    }
    if (path.includes('/operations/')) return new Promise<Response>(() => {})
    throw new Error(`Unexpected request: ${path}`)
  }))
  const targetSession = { ...session, id: webcrypto.randomUUID() }
  if (recovered) localStorage.setItem(`threaddeck:chat-operation:${targetSession.id}`, JSON.stringify({ ...recovered, text: 'Same prompt', files: [], optimistic: true, delivery: 'send' }))
  const markRead = vi.fn()
  const pane = (focusRequest: number) => <ConversationPane target={{ session: targetSession, project }} focusRequest={focusRequest} mobileSidebar={false} sidebarOpen={false} sidebar={vi.fn()} created={vi.fn()} markRead={markRead} />
  const rendered = render(pane(0))
  await waitFor(() => expect(screen.getByLabelText('Conversation messages').getAttribute('aria-busy')).toBe('false'))
  return { ...rendered, markRead, session: targetSession, reopen: () => rendered.rerender(pane(1)), send: async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Write a prompt' }), { target: { value: 'Same prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(operation).not.toBe(''))
    return operation
  }, publish: async (message: PublishedMessage) => { await act(async () => { publish!(message) }) } }
}

it('preserves a manual unread marker in the visible thread until explicitly reopened', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const frames = new Map<number, FrameRequestCallback>()
  let frame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frame, callback); return frame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  const flush = () => act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) })
  const app = await setup([{ ...published('100000000000000007', 'reply'), content: 'Agent reply' }])
  flush()
  expect(app.markRead).toHaveBeenCalled()
  app.markRead.mockClear()
  act(() => {
    window.dispatchEvent(new CustomEvent('threaddeck:mark-unread', { detail: app.session.id }))
    window.dispatchEvent(new Event('focus'))
  })
  flush()
  expect(app.markRead).not.toHaveBeenCalled()
  app.reopen()
  flush()
  expect(app.markRead).toHaveBeenCalled()
})

it('replaces the optimistic prompt when Discord publishes before its receipt arrives', async () => {
  const app = await setup()
  const operation = await app.send()
  expect(screen.getByRole('article', { name: 'Outgoing prompt' })).toBeTruthy()
  await app.publish(published('100000000000000007', operation))
  expect(app.container.querySelector('[data-message-id="100000000000000007"]')).toBeTruthy()
  expect(screen.queryByRole('article', { name: 'Outgoing prompt' })).toBeNull()
  expect(screen.getAllByText('Same prompt', { exact: true })).toHaveLength(1)
})

it('never reconciles an unrelated submission just because its text is identical', async () => {
  const app = await setup()
  const operation = await app.send()
  await app.publish(published('100000000000000007', 'unrelated-operation'))
  expect(screen.getByRole('article', { name: 'Outgoing prompt' })).toBeTruthy()
  await app.publish(published('100000000000000008', operation))
  expect(screen.queryByRole('article', { name: 'Outgoing prompt' })).toBeNull()
  expect(screen.getAllByText('Same prompt', { exact: true })).toHaveLength(2)
})

it('reconciles a recovered pending prompt from its persisted nonce before the receipt', async () => {
  const id = webcrypto.randomUUID()
  await setup([published('100000000000000007', id)], { id, nonce: nonce(id) })
  expect(screen.queryByRole('article', { name: 'Outgoing prompt' })).toBeNull()
  expect(screen.getAllByText('Same prompt', { exact: true })).toHaveLength(1)
})

it('reconstructs correlation for pending prompts saved by older versions', async () => {
  const id = webcrypto.randomUUID()
  await setup([published('100000000000000007', id)], { id })
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Outgoing prompt' })).toBeNull())
  expect(screen.getAllByText('Same prompt', { exact: true })).toHaveLength(1)
})
