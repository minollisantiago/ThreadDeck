import type { Project, Session } from '../../shared/model'
import { scheduleTitle, type Schedule, type ScheduleOperation } from '../../shared/schedules'

// Resolve the exact dispatched run, not the selected routine or its next run.
// Receipts can arrive before inventory and successful one-shots disappear.
export function scheduleRunSession(operation: ScheduleOperation | null, tasks: Schedule[], projects: Project[]): Session | null {
  const result = operation?.result
  if (operation?.action !== 'run' || operation.state !== 'succeeded' || result?.ran !== true || !result.sessionId || !/^\d{17,20}$/.test(result.threadId || '')) return null
  const sessions = projects.flatMap(project => project.sessions)
  const known = sessions.find(session => session.id === result.sessionId && session.threadId === result.threadId)
  if (known) return result.projectId && result.projectId !== known.projectId ? null : known
  if (sessions.some(session => session.id === result.sessionId || session.threadId === result.threadId)) return null
  const task = tasks.find(task => task.id === result.routineId)
  const project = projects.find(project => project.id === (result.projectId || task?.projectId))
  if (!project) return null
  return { id: result.sessionId, threadId: result.threadId!, projectId: project.id, guildId: null, title: task ? scheduleTitle(task) : `Scheduled run #${result.routineId}`, status: 'idle', agentCount: 0, updatedAt: operation.updatedAt }
}
