import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ProposalInput, ProposalMutation } from '../shared/proposals'
import { pendingLaunch, proposalMutationSchema } from '../shared/proposals'
import type { Snapshot } from '../shared/model'
import { ProposalStore } from './proposal-store'
import { proposalHandler } from './proposals'

const projectId = '100000000000000001'
const input: ProposalInput = { projectId, key: 'draft-recovery', title: 'Keep drafts through reconnects', summary: 'Protect unfinished work.', rationale: 'Investigate draft recovery before changing code.', prompt: 'Check the existing recovery path. Plan first.', kind: 'observed', effort: 'small', evidence: [{ label: 'Draft lifecycle', reference: 'src/chat/drafts.ts' }] }
const stores: ProposalStore[] = [], servers: ReturnType<typeof createServer>[] = [], directories: string[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })))
  for (const store of stores.splice(0)) store.close()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
function store(now = Date.now, filename = ':memory:') { const value = new ProposalStore(filename, now); stores.push(value); return value }
function launch(s: ProposalStore, requestId = randomUUID()): Extract<ProposalMutation, { action: 'launch' }> { const p = s.list().proposals[0]; return { action: 'launch', id: p.id, revision: p.revision, requestId, prompt: 'My edited starting prompt', approach: 'investigate' } }
it('deduplicates by project/key while preserving decisions, sessions and decision notes', () => {
  const s = store(); s.ingest([input]); const p = s.list().proposals[0]
  s.decide({ action: 'decide', id: p.id, revision: p.revision, status: 'dismissed', reason: 'Not worth the scope' })
  s.ingest([{ ...input, title: 'Updated evidence', prompt: 'A revised proposed prompt' }])
  expect(s.list().proposals).toHaveLength(1)
  expect(s.list().proposals[0]).toMatchObject({ id: p.id, title: 'Updated evidence', status: 'dismissed', decisionReason: 'Not worth the scope' })
  expect(() => s.decide({ action: 'decide', id: p.id, revision: p.revision, status: 'inbox', reason: '' })).toThrow(/changed/)
  s.ingest([{ ...input, projectId: '100000000000000002' }]); expect(s.list().proposals).toHaveLength(2)
})
it('wakes snoozed proposals only when due, across routine ingestion', () => {
  let now = 1000; const s = store(() => now); s.ingest([input]); const p = s.list().proposals[0]
  s.decide({ action: 'decide', id: p.id, revision: p.revision, status: 'snoozed', snoozedUntil: 2000, reason: 'Later' })
  now = 1999; s.ingest([input]); expect(s.list().proposals[0].status).toBe('snoozed')
  now = 2000; expect(s.list().proposals[0]).toMatchObject({ status: 'inbox', snoozedUntil: null, decisionReason: 'Later' })
})
it('persists private data and serializes competing app/CLI writers', async () => {
  const directory = await mkdtemp('/tmp/opencode/threaddeck-proposal-test-'); directories.push(directory)
  const filename = path.join(directory, 'proposals.sqlite'), a = store(Date.now, filename), b = store(Date.now, filename)
  a.ingest([input]); const request = launch(a)
  a.reserve(request)
  expect(b.reserve(request).fresh).toBe(false)
  expect(() => b.reserve({ ...request, requestId: randomUUID(), revision: b.list().proposals[0].revision })).toThrow(/existing delivery/)
  expect((await stat(filename)).mode & 0o777).toBe(0o600)
  expect(pendingLaunch(b.list().proposals[0])).toBe(true)
})
it('holds a durable guard for uncertain delivery and reconciles without resubmission or clock assumptions', () => {
  const s = store(() => 5000); s.ingest([input]); const request = launch(s); s.reserve(request)
  s.uncertain(request.id, request.requestId)
  expect(pendingLaunch(s.list().proposals[0])).toBe(true)
  const p = s.settle(request.id, { id: request.requestId, state: 'submitted', sessionId: 'ses_confirmed', threadId: '100000000000000003', messageIds: [], updatedAt: 10 })
  expect(p).toMatchObject({ status: 'progress', session: { id: 'ses_confirmed', threadId: '100000000000000003' } })
  expect(pendingLaunch(p)).toBe(false)
  expect(s.settle(p.id, { id: request.requestId, state: 'accepted', messageIds: [], updatedAt: 20 }).status).toBe('progress')
  s.ingest([input]); expect(s.list().proposals[0].session?.id).toBe('ses_confirmed')
})
it('does not mistake a success without a session link for safe delivery', () => {
  const s = store(); s.ingest([input]); const request = launch(s); s.reserve(request)
  const p = s.settle(request.id, { id: request.requestId, state: 'submitted', messageIds: [], updatedAt: 1 })
  expect(p.launch?.receipt.state).toBe('unknown'); expect(pendingLaunch(p)).toBe(true)
  expect(() => s.decide({ action: 'decide', id: p.id, revision: p.revision, status: 'done', reason: '' })).toThrow(/delivery/)
})
it('requires explicit guard resolution and keeps historical launch IDs idempotent', () => {
  const s = store(); s.ingest([input]); const request = launch(s); s.reserve(request)
  expect(() => s.resolve(request.id, request.requestId)).toThrow(/Check delivery/)
  s.uncertain(request.id, request.requestId); s.resolve(request.id, request.requestId)
  expect(pendingLaunch(s.list().proposals[0])).toBe(false)
  expect(s.reserve(request).fresh).toBe(false)
  expect(s.reserve(launch(s)).fresh).toBe(true)
})
it('validates user and ingestion fields and keeps in-progress status receipt-owned', () => {
  expect(proposalMutationSchema.safeParse({ action: 'decide', id: randomUUID(), revision: randomUUID(), status: 'progress' }).success).toBe(false)
  expect(() => store().ingest([{ ...input, evidence: [] }])).toThrow()
  expect(proposalMutationSchema.safeParse({ action: 'ingest', proposals: [{ ...input, status: 'inbox' }] }).success).toBe(false)
})
async function setup(fail = false) {
  const s = store(); s.ingest([input])
  const call = vi.fn(async (route: string, value: Record<string, unknown>) => {
    if (fail && route === 'submit') throw new Error('Response lost')
    return { id: value.requestId || value.id, state: route === 'submit' ? 'accepted' : 'submitted', ...(route === 'operation' && { sessionId: 'ses_linked', threadId: '100000000000000003' }), messageIds: [], updatedAt: 1 }
  })
  const snapshot: Snapshot = { health: 'connected', checkedAt: Date.now(), lastSuccessAt: Date.now(), inventoryLimited: false, attentionAvailable: true, message: null, projects: [{ id: projectId, name: 'ThreadDeck', directory: '/fixture', sessions: [] }] }
  const server = createServer(); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  server.on('request', proposalHandler(port, s, { read: () => snapshot }, { call }))
  const url = `http://127.0.0.1:${port}/api/proposals`
  const post = (value: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  return { s, call, url, post, snapshot }
}
it('protects local endpoints and rejects unregistered projects and malformed mutations', async () => {
  const { url, post, call } = await setup()
  expect((await fetch(url, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
  expect((await fetch(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(415)
  expect((await post({ action: 'ingest', proposals: [{ ...input, projectId: '100000000000000099' }] })).status).toBe(400)
  expect((await post({ action: 'ingest', proposals: [{ ...input, shell: 'bad' }] })).status).toBe(400)
  expect(call).not.toHaveBeenCalled()
  expect((await fetch(url)).headers.get('cache-control')).toBe('no-store')
})
it('launches once despite duplicate clicks, persists before submission, and links a confirmed operation', async () => {
  const { s, post, call } = await setup(); const request = launch(s)
  const responses = await Promise.all([post(request), post(request)])
  expect(responses.map(r => r.status)).toEqual([200, 200]); expect(call).toHaveBeenCalledTimes(1)
  expect(call.mock.calls[0]).toEqual(['submit', expect.objectContaining({ requestId: request.requestId, projectId, delivery: 'send', text: expect.stringContaining('Investigate only.') })])
  expect(pendingLaunch(s.list().proposals[0])).toBe(true)
  await post({ action: 'reconcile', id: request.id, requestId: request.requestId })
  expect(s.list().proposals[0].status).toBe('progress'); expect(call.mock.calls.map(([route]) => route)).toEqual(['submit', 'operation'])
})
it('never repeats a submission after a lost response, including after a reload', async () => {
  const { s, post, call } = await setup(true); const request = launch(s)
  expect((await post(request)).status).toBe(200)
  expect(s.list().proposals[0].launch?.receipt.state).toBe('unknown')
  await post(request); expect(call).toHaveBeenCalledTimes(1)
  await post({ action: 'reconcile', id: request.id, requestId: request.requestId })
  expect(s.list().proposals[0].session?.id).toBe('ses_linked')
})
it('does not reserve or launch against a disconnected or silently stale project inventory', async () => {
  const { s, post, call, snapshot } = await setup()
  snapshot.health = 'stale'
  expect((await post(launch(s))).status).toBe(503)
  snapshot.health = 'connected'; snapshot.lastSuccessAt = 1
  expect((await post(launch(s))).status).toBe(503)
  expect(s.list().proposals[0].launch).toBeNull(); expect(call).not.toHaveBeenCalled()
})
