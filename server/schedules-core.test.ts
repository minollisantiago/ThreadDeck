import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createScheduleOperations, type ScheduleAdapter } from '../integrations/kimaki/schedules-core'
import { ChatError } from '../shared/chat'
import { scheduleMutationSchema, scheduleTitle, type Schedule } from '../shared/schedules'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
const create = { requestId: '7c18b13a-6d07-419d-b54f-e8024fc91673', action: 'create', projectId: '100000000000000001', prompt: 'Full\n' + 'long prompt '.repeat(40), sendAt: '0 12 * * 1', allowConcurrency: false }
function setup(mutate: ScheduleAdapter['mutate'] = async () => ({ routineId: 1 }), initialTasks: Schedule[] = []) {
  const db = new DatabaseSync(':memory:')
  let tasks = initialTasks
  const adapter = { list: vi.fn(async () => ({ schedules: tasks, checkedAt: 123 })), mutate: vi.fn(mutate) }
  let service = createScheduleOperations(adapter, db)
  cleanups.push(async () => { await service.stop(); db.close() })
  return { db, adapter, setTasks(value: Schedule[]) { tasks = value }, get service() { return service }, async restart() { await service.stop(); service = createScheduleOperations(adapter, db) } }
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
  expect(await service.list()).toEqual({ schedules: [], checkedAt: 123, namesSupported: true })
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
  for (const name of ['x'.repeat(101), 'Two\nlines', 'Two\tcolumns']) expect(scheduleMutationSchema.safeParse({ ...create, name }).success).toBe(false)
})
const task: Schedule = { id: 1, projectId: create.projectId, status: 'planned', kind: 'cron', expression: create.sendAt, timezone: 'UTC', nextRunAt: '2027-01-01T12:00:00Z', prompt: create.prompt, preview: 'Full...', threadId: null, notifyOnly: false, agent: 'build', model: null, preRun: 'echo existing', allowConcurrency: false, lastError: null, revision: 'a'.repeat(64), editable: true }
async function settled(service: ReturnType<typeof createScheduleOperations>, input: Record<string, unknown>) {
  const id = randomUUID()
  service.submit({ ...input, requestId: id })
  await vi.waitFor(() => expect(service.operation(id).state).not.toMatch(/accepted|running/))
  return service.operation(id)
}
it('persists independent names without invoking any scheduler writer', async () => {
  const fixture = setup(undefined, [task])
  expect((await fixture.service.list()).namesSupported).toBe(true)
  const result = await settled(fixture.service, { action: 'edit', id: task.id, revision: task.revision, changes: { name: 'Weekly backtests' } })
  expect(result.state).toBe('succeeded')
  expect(fixture.adapter.mutate).not.toHaveBeenCalled()
  const named = (await fixture.service.list()).schedules[0]
  expect(named).toMatchObject({ name: 'Weekly backtests', prompt: task.prompt, expression: task.expression, nextRunAt: task.nextRunAt, preRun: task.preRun })
  expect(named.revision).not.toBe(task.revision)
  await fixture.restart()
  expect((await fixture.service.list()).schedules[0].name).toBe('Weekly backtests')
  expect(scheduleTitle((await fixture.service.list()).schedules[0])).toBe('Weekly backtests')
})
it('guards concurrent renames and unwraps display-name revisions for real edits and runs', async () => {
  const fixture = setup(undefined, [task])
  await settled(fixture.service, { action: 'edit', id: task.id, revision: task.revision, changes: { name: 'Stable title' } })
  expect((await settled(fixture.service, { action: 'edit', id: task.id, revision: task.revision, changes: { name: 'Stale overwrite' } })).state).toBe('failed')
  const named = (await fixture.service.list()).schedules[0]
  expect((await settled(fixture.service, { action: 'edit', id: task.id, revision: named.revision, changes: { prompt: 'Different instruction' } })).state).toBe('succeeded')
  expect(fixture.adapter.mutate).toHaveBeenCalledWith(expect.objectContaining({ revision: task.revision, changes: { prompt: 'Different instruction' } }))
  expect((await fixture.service.list()).schedules[0].name).toBe('Stable title')
  expect((await settled(fixture.service, { action: 'run', id: task.id, revision: named.revision })).state).toBe('succeeded')
  expect(fixture.adapter.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'run', revision: task.revision }))
})
it('stores names on creation without sending them to the agent, and can restore automatic titles', async () => {
  const fixture = setup(async input => { if (input.action === 'create') fixture.setTasks([task]); return { routineId: task.id } })
  expect((await settled(fixture.service, { ...create, name: 'Friendly name' })).state).toBe('succeeded')
  expect(fixture.adapter.mutate.mock.calls[0][0]).not.toHaveProperty('name')
  const named = (await fixture.service.list()).schedules[0]
  expect(named.name).toBe('Friendly name')
  expect((await settled(fixture.service, { action: 'edit', id: task.id, revision: named.revision, changes: { name: '' } })).state).toBe('succeeded')
  const cleared = (await fixture.service.list()).schedules[0]
  expect(cleared.name).toBeNull()
  expect(cleared.revision).toBe(task.revision)
  expect(scheduleTitle(cleared)).toBe(scheduleTitle(task))
})
it('preserves a name on rejected native edits and removes it only after confirmed deletion', async () => {
  const fixture = setup(undefined, [task])
  await settled(fixture.service, { action: 'edit', id: task.id, revision: task.revision, changes: { name: 'Keep this name' } })
  const named = (await fixture.service.list()).schedules[0]
  fixture.adapter.mutate.mockRejectedValueOnce(new ChatError('invalid', 'Invalid schedule'))
  expect((await settled(fixture.service, { action: 'edit', id: task.id, revision: named.revision, changes: { name: 'Not saved', sendAt: 'bad cron' } })).state).toBe('failed')
  expect((await fixture.service.list()).schedules[0].name).toBe('Keep this name')
  expect((await settled(fixture.service, { action: 'delete', id: task.id, revision: named.revision })).state).toBe('succeeded')
  expect(fixture.db.prepare('SELECT * FROM schedule_names').all()).toHaveLength(0)
})
