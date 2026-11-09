import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { createScheduleOperations, type ScheduleAdapter } from '../integrations/kimaki/schedules-core'
import { ChatError } from '../shared/chat'
import { scheduleMutationSchema } from '../shared/schedules'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
const create = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', action: 'create', projectId: '100000000000000001', prompt: 'Full\n' + 'long prompt '.repeat(40), sendAt: '0 12 * * 1', allowConcurrency: false }
function setup(mutate: ScheduleAdapter['mutate'] = async () => ({ routineId: 1 })) {
  const db = new DatabaseSync(':memory:')
  const adapter = { list: vi.fn(async () => ({ schedules: [], checkedAt: 123 })), mutate: vi.fn(mutate) }
  let service = createScheduleOperations(adapter, db)
  cleanups.push(async () => { await service.stop(); db.close() })
  return { db, adapter, get service() { return service }, async restart() { await service.stop(); service = createScheduleOperations(adapter, db) } }
}
it('deduplicates request IDs before scheduling work and rejects conflicting bodies', async () => {
  const { service, adapter } = setup()
  expect(service.submit(create).state).toBe('accepted')
  service.submit(create)
  expect(() => service.submit({ ...create, prompt: 'changed' })).toThrow('different schedule changes')
  await vi.waitFor(() => expect(service.operation(create.requestId).state).toBe('succeeded'))
  expect(adapter.mutate).toHaveBeenCalledTimes(1)
  expect(adapter.mutate).toHaveBeenCalledWith(expect.objectContaining({ prompt: create.prompt }))
  service.submit(create); expect(adapter.mutate).toHaveBeenCalledTimes(1)
})
it('keeps long-running operations inspectable without blocking submission/status', async () => {
  let finish!: (value: unknown) => void
  const { service } = setup(() => new Promise(resolve => { finish = resolve }))
  service.submit(create)
  await vi.waitFor(() => expect(service.operation(create.requestId).state).toBe('running'))
  expect(await service.list()).toEqual({ schedules: [], checkedAt: 123 })
  finish({ routineId: 1, ran: false, reason: 'Previous session busy' })
  await vi.waitFor(() => expect(service.operation(create.requestId)).toMatchObject({ state: 'succeeded', result: { ran: false } }))
})
it('retains ambiguous outcomes and never retries an external effect', async () => {
  const { service, adapter } = setup(async () => { throw new Error('transport lost after dispatch') })
  service.submit(create)
  await vi.waitFor(() => expect(service.operation(create.requestId).state).toBe('unknown'))
  service.submit(create); expect(adapter.mutate).toHaveBeenCalledTimes(1)
})
it('distinguishes explicit validation rejection from an unknown outcome', async () => {
  const { service } = setup(async () => { throw new ChatError('conflict', 'Schedule changed') })
  service.submit(create)
  await vi.waitFor(() => expect(service.operation(create.requestId)).toMatchObject({ state: 'failed', error: 'Schedule changed' }))
})
it('recovers pending receipts as unknown after restart without replay', async () => {
  const fixture = setup()
  fixture.db.prepare('INSERT INTO schedule_operations VALUES (?, ?, ?)').run(create.requestId, 'old-hash', JSON.stringify({ id: create.requestId, action: 'run', state: 'running', updatedAt: 1 }))
  await fixture.restart()
  expect(fixture.service.operation(create.requestId).state).toBe('unknown')
  expect(fixture.adapter.mutate).not.toHaveBeenCalled()
})
it('rejects unsafe IDs, unexpected advanced options and empty edits', () => {
  expect(scheduleMutationSchema.safeParse({ ...create, preRun: 'echo nope' }).success).toBe(false)
  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(scheduleMutationSchema.safeParse({ requestId: create.requestId, action: 'delete', id, revision: 'a'.repeat(64) }).success).toBe(false)
  expect(scheduleMutationSchema.safeParse({ requestId: create.requestId, action: 'edit', id: 1, revision: 'a'.repeat(64), changes: {} }).success).toBe(false)
  expect(scheduleMutationSchema.parse({ requestId: create.requestId, action: 'edit', id: 1, revision: 'a'.repeat(64), changes: { agent: '' } })).toMatchObject({ changes: { agent: '' } })
})
