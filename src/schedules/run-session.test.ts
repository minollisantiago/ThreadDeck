import { expect, it } from 'vitest'
import type { Project, Session } from '../../shared/model'
import type { Schedule, ScheduleOperation } from '../../shared/schedules'
import { scheduleRunSession } from './run-session'

const projectId = '100000000000000010', threadId = '100000000000000020'
const project: Project = { id: projectId, name: 'Project', directory: '/project', sessions: [] }
const receipt: ScheduleOperation = { id: '7c18b13a-6d07-419d-b54f-e8024fc91673', action: 'run', state: 'succeeded', updatedAt: 1, result: { routineId: 3, ran: true, sessionId: 'ses_run', threadId, projectId } }
const task: Schedule = { id: 3, projectId, prompt: 'Task title', preview: 'Task title', status: 'planned', kind: 'cron', expression: '@daily', timezone: 'UTC', nextRunAt: '2027-01-01T00:00:00Z', threadId: null, notifyOnly: false, agent: null, model: null, preRun: null, allowConcurrency: false, lastError: null, editable: true, revision: 'a'.repeat(64) }
it('uses the exact existing session without altering its live state', () => {
  const known: Session = { id: 'ses_run', threadId, projectId, title: 'Live title', status: 'working', agentCount: 1, updatedAt: 5, guildId: null }
  expect(scheduleRunSession(receipt, [], [{ ...project, sessions: [known] }])).toBe(known)
})
it('opens a newly dispatched one-shot before inventory arrives and after its routine disappears', () => {
  expect(scheduleRunSession(receipt, [], [project])).toMatchObject({ id: 'ses_run', threadId, projectId, title: 'Scheduled run #3' })
})
it('supports older receipts using the matching routine project, not the selected task', () => {
  const old = { ...receipt, result: { ...receipt.result!, projectId: undefined } }
  expect(scheduleRunSession(old, [{ ...task, id: 9, projectId: '100000000000000099' }, task], [project])).toMatchObject({ projectId, title: 'Task title' })
})
it('does not invent a thread for unknown, skipped, notification-only or non-run operations', () => {
  for (const operation of [null, { ...receipt, state: 'running' as const }, { ...receipt, state: 'unknown' as const }, { ...receipt, action: 'create' as const }, { ...receipt, result: { ...receipt.result!, ran: false } }, { ...receipt, result: { ...receipt.result!, sessionId: null } }, { ...receipt, result: { ...receipt.result!, threadId: 'invalid' } }]) {
    expect(scheduleRunSession(operation, [task], [project])).toBeNull()
  }
})
it('does not guess an unregistered project or mix conflicting session/thread IDs', () => {
  expect(scheduleRunSession(receipt, [task], [])).toBeNull()
  const wrong: Session = { id: 'ses_other', threadId, projectId, title: 'Different session', status: 'idle', agentCount: 0, updatedAt: 5, guildId: null }
  expect(scheduleRunSession(receipt, [task], [{ ...project, sessions: [wrong] }])).toBeNull()
})
