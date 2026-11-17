// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { Session } from '../../shared/model'
import { ReviewSummaryCache } from './review-summary'

const session: Session = { id: 'session', projectId: 'project', threadId: '100000000000000001', guildId: null, title: 'Test', status: 'idle', agentCount: 0, responseAt: 100, updatedAt: 100 }
const history = { messages: [{ id: '1', channel_id: session.threadId, content: 'Prepared response', timestamp: '2026-11-17T00:00:00Z', author: { id: 'agent', username: 'Agent', bot: true } }], cursor: '0', before: null, stale: false }
afterEach(() => { vi.unstubAllGlobals(); delete window.threaddeckDesktop })
function request() { const fetch = vi.fn(async () => new Response(JSON.stringify(history), { status: 200 })); vi.stubGlobal('fetch', fetch); return fetch }

it('prepares a thread once and reuses the exact result across tab openings and concurrent callers', async () => {
  const fetch = request(), cache = new ReviewSummaryCache()
  await cache.prepare([session])
  const [first, second] = await Promise.all([cache.get(session), cache.get(session)])
  expect(first).toBe(second)
  expect(first.exchange?.agent).toBe('Prepared response')
  expect(fetch).toHaveBeenCalledTimes(1)
  await cache.get({ ...session, responseAt: 200 })
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('reuses native startup histories rather than reading them again in the dashboard', async () => {
  const fetch = request()
  window.threaddeckDesktop = { control: vi.fn(), onMaximized: () => () => {}, reviewSummary: vi.fn(async () => ({ state: 'ready', items: [{ threadId: session.threadId, version: 100, history }] })) }
  const cache = new ReviewSummaryCache()
  await cache.prepare([session])
  expect((await cache.get(session)).exchange?.agent).toBe('Prepared response')
  expect(fetch).not.toHaveBeenCalled()
  expect(window.threaddeckDesktop.reviewSummary).toHaveBeenCalledTimes(1)
})
it('keeps failures cached until explicit retry instead of rebuilding on every tab opening', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch)
  const cache = new ReviewSummaryCache()
  await cache.prepare([session])
  expect((await cache.get(session)).error).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(1)
  fetch.mockResolvedValue(new Response(JSON.stringify(history), { status: 200 }))
  expect((await cache.get(session, true)).error).toBe('')
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('exposes native preparation failure as retryable without immediately repeating startup work', async () => {
  const fetch = request()
  window.threaddeckDesktop = { control: vi.fn(), onMaximized: () => () => {}, reviewSummary: async () => ({ state: 'failed', items: [] }) }
  const cache = new ReviewSummaryCache()
  await cache.prepare([session])
  expect((await cache.get(session)).error).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
  expect((await cache.get(session, true)).error).toBe('')
  expect(fetch).toHaveBeenCalledTimes(1)
})
