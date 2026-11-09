import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { ChatError } from '../../shared/chat.ts'
import { scheduleMutationSchema, scheduleOperationSchema, schedulesResponseSchema, type ScheduleMutation, type ScheduleOperation } from '../../shared/schedules.ts'

export interface ScheduleAdapter {
  list(): Promise<unknown>
  mutate(input: ScheduleMutation): Promise<unknown>
}

// Receipts live beside chat receipts, not in Kimaki's scheduler tables. A restart
// never replays an unconfirmed dispatch. A duplicate ID only returns its receipt.
export function createScheduleOperations(adapter: ScheduleAdapter, db: DatabaseSync) {
  db.exec('CREATE TABLE IF NOT EXISTS schedule_operations (id TEXT PRIMARY KEY, hash TEXT NOT NULL, receipt TEXT NOT NULL)')
  const select = db.prepare('SELECT hash, receipt FROM schedule_operations WHERE id = ?')
  const save = db.prepare('UPDATE schedule_operations SET receipt = ? WHERE id = ?')
  for (const row of db.prepare('SELECT id, receipt FROM schedule_operations').all()) {
    const receipt = scheduleOperationSchema.parse(JSON.parse(String(row.receipt)))
    if (receipt.state === 'accepted' || receipt.state === 'running') save.run(JSON.stringify({ ...receipt, state: 'unknown', updatedAt: Date.now(), error: 'Kimaki restarted before this operation was confirmed. Inspect schedules and Discord; do not automatically retry.' }), String(row.id))
  }
  const workers = new Set<Promise<void>>()
  let stopped = false, tail: Promise<void> = Promise.resolve()
  function update(receipt: ScheduleOperation, patch: Partial<ScheduleOperation>) {
    Object.assign(receipt, patch, { updatedAt: Date.now() }); save.run(JSON.stringify(receipt), receipt.id)
  }
  return {
    async list() { return schedulesResponseSchema.parse(await adapter.list()) },
    operation(id: string) {
      const row = select.get(id)
      if (!row) throw new ChatError('not_found', 'Unknown schedule operation. Its outcome is not confirmed; inspect schedules before trying again.')
      return scheduleOperationSchema.parse(JSON.parse(String(row.receipt)))
    },
    submit(value: unknown) {
      const input = scheduleMutationSchema.parse(value)
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      const existing = select.get(input.requestId)
      if (existing) {
        if (existing.hash !== hash) throw new ChatError('conflict', 'This operation ID was already used for different schedule changes')
        return scheduleOperationSchema.parse(JSON.parse(String(existing.receipt)))
      }
      if (stopped || workers.size >= 16) throw new ChatError('busy', 'Schedule operations are busy. Check existing operations before starting another.')
      const receipt: ScheduleOperation = { id: input.requestId, action: input.action, state: 'accepted', updatedAt: Date.now() }
      db.prepare('INSERT INTO schedule_operations VALUES (?, ?, ?)').run(receipt.id, hash, JSON.stringify(receipt))
      // Serialize desktop writers. Scheduler/native CLI races are guarded by the
      // canonical edit CAS and scheduler claim, not by this queue alone.
      const work = tail.then(async () => {
        if (stopped) { update(receipt, { state: 'unknown', error: 'Bridge stopped before the operation was confirmed' }); return }
        update(receipt, { state: 'running' })
        try {
          const result = scheduleOperationSchema.shape.result.unwrap().parse(await adapter.mutate(input))
          update(receipt, { state: 'succeeded', result })
        } catch (error) {
          const safe = error instanceof ChatError && ['invalid', 'conflict', 'not_found', 'unsupported'].includes(error.code)
          update(receipt, { state: safe ? 'failed' : 'unknown', error: safe ? error.message : 'The schedule operation could not be confirmed. Inspect schedules and Discord before deciding to try again.' })
        }
      }).finally(() => workers.delete(work))
      workers.add(work); tail = work.catch(() => {})
      return { ...receipt }
    },
    async stop() { stopped = true; await Promise.allSettled(workers) },
  }
}
